"""The policy and value network (PyTorch).

Body: a fully convolutional net in the style of the microRTS and Lux AI winners: residual blocks
with squeeze-excitation at full resolution (48 x 48), a quarter-resolution middle section (12 x 12) so
every cell sees the whole map, and a way back up. The 8 global numbers are fed in as extra constant
planes.

Heads, evaluated only at the K cells holding the player's units and buildings ("actors"):
  type        11 logits (gridnet.ACTION_TYPES)
  build_kind  4, train_kind 4
  local       a pointer into the actor's 15 x 15 window: query(actor) . key(cell), with separate keys
              for each of the 8 local heads (attack, guard, harvest, help_build, build x 4)
  region      a pointer over the 8 x 8-cell regions: query(actor) . key(region)
Values: two numbers per seat, for the win/loss reward and for the shaping reward.

An actor's action is sampled type first, then only the parts that type uses; its log-probability
is the sum over those parts, and a seat's is the sum over its actors.
"""

from __future__ import annotations

import math

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical

from ..config import PLACEABLE_KINDS, UNIT_KINDS
from ..gridnet import A, ACTION_TYPES, GLOBALS, HEAD, LOCAL_HEADS, PLANES, RADIUS, REGION, WINDOW

N_TYPES = len(ACTION_TYPES)
N_HEADS = len(LOCAL_HEADS)
N_BUILD = len(PLACEABLE_KINDS)
N_TRAIN = len(UNIT_KINDS)
MASKED = -1e9

# Which local head each action type points with: -1 none, -2 "the build head of the chosen kind".
_TYPE_HEAD = [-1] * N_TYPES
for _name in ("attack", "guard", "harvest", "help_build"):
    _TYPE_HEAD[A[_name]] = HEAD[_name]
_TYPE_HEAD[A["build"]] = -2
_USES_REGION = [name in ("move", "attack_move") for name in ACTION_TYPES]
FIRST_BUILD_HEAD = HEAD[f"build_{PLACEABLE_KINDS[0]}"]


class SqueezeExcite(nn.Module):
    def __init__(self, channels: int, reduction: int = 4):
        super().__init__()
        self.fc1 = nn.Linear(channels, max(4, channels // reduction))
        self.fc2 = nn.Linear(max(4, channels // reduction), channels)

    def forward(self, x):
        s = x.mean(dim=(2, 3))
        s = torch.sigmoid(self.fc2(F.relu(self.fc1(s))))
        return x * s[:, :, None, None]


class ResBlock(nn.Module):
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)
        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)
        self.se = SqueezeExcite(channels)

    def forward(self, x):
        y = self.se(self.conv2(F.relu(self.conv1(x))))
        return F.relu(x + y)


def masked(logits, mask):
    return logits.masked_fill(~mask, MASKED)


class EldertideNet(nn.Module):
    def __init__(self, height: int, width: int, channels: int = 64, deep_channels: int = 128,
                 high_blocks: int = 3, low_blocks: int = 4, key_dim: int = 8):
        super().__init__()
        if height % 4 or width % 4:
            raise ValueError("the grid must be a multiple of 4 cells each way")
        self.height, self.width, self.key_dim = height, width, key_dim
        in_channels = len(PLANES) + len(GLOBALS)
        self.stem = nn.Conv2d(in_channels, channels, 3, padding=1)
        self.high = nn.Sequential(*[ResBlock(channels) for _ in range(high_blocks)])
        self.down = nn.Conv2d(channels, deep_channels, 4, stride=4)
        self.low = nn.Sequential(*[ResBlock(deep_channels) for _ in range(low_blocks)])
        self.up = nn.ConvTranspose2d(deep_channels, channels, 4, stride=4)
        self.out = nn.Sequential(ResBlock(channels), ResBlock(channels))
        self.glob = nn.Sequential(nn.Linear(2 * deep_channels, 256), nn.ReLU(), nn.Linear(256, 128), nn.ReLU())
        self.value = nn.Linear(128, 2)
        self.actor = nn.Sequential(nn.Linear(channels + 128, 256), nn.ReLU(), nn.Linear(256, 128), nn.ReLU())
        self.type_head = nn.Linear(128, N_TYPES)
        self.build_head = nn.Linear(128, N_BUILD)
        self.train_head = nn.Linear(128, N_TRAIN)
        self.key = nn.Conv2d(channels, N_HEADS * key_dim, 1)
        self.query = nn.Linear(128, N_HEADS * key_dim)
        self.region_key = nn.Linear(channels, key_dim)
        self.region_query = nn.Linear(128, key_dim)
        self.register_buffer("type_head_of", torch.tensor(_TYPE_HEAD, dtype=torch.long), persistent=False)
        self.register_buffer("uses_region", torch.tensor(_USES_REGION, dtype=torch.bool), persistent=False)
        offsets = torch.arange(WINDOW)
        self.register_buffer("win_dy", offsets.repeat_interleave(WINDOW), persistent=False)  # [225] row offset
        self.register_buffer("win_dx", offsets.repeat(WINDOW), persistent=False)  # [225] column offset
        nn.init.zeros_(self.value.weight)
        nn.init.zeros_(self.value.bias)

    # ---------------------------------------------------------------- body

    def trunk(self, planes, globals_):
        """planes uint8 [B, H, W, C], globals float [B, G] -> features [B, ch, H, W], global [B, 128], values [B, 2]."""
        b, h, w, _ = planes.shape
        x = planes.permute(0, 3, 1, 2).float() / 255.0
        g = globals_.float()[:, :, None, None].expand(b, globals_.shape[1], h, w)
        x = self.high(F.relu(self.stem(torch.cat([x, g], dim=1))))
        low = self.low(F.relu(self.down(x)))
        feat = self.out(x + self.up(low))
        pooled = torch.cat([low.mean(dim=(2, 3)), low.amax(dim=(2, 3))], dim=1)
        glob = self.glob(pooled)
        return feat, glob, self.value(glob)

    def actor_hidden(self, feat, glob, cells):
        """The feature vector of every actor: features at its cell plus the global vector. [B, K, 128]"""
        b, ch, h, w = feat.shape
        k = cells.shape[1]
        idx = (cells[..., 1] * w + cells[..., 0]).clamp(0, h * w - 1)  # [B, K]
        at = feat.reshape(b, ch, h * w).gather(2, idx[:, None, :].expand(b, ch, k)).transpose(1, 2)  # [B, K, ch]
        return self.actor(torch.cat([at, glob[:, None, :].expand(b, k, glob.shape[1])], dim=2))

    def local_logits(self, feat, hidden, cells, heads):
        """Logits over each actor's 15 x 15 window, using the local head `heads` [B, K] of each actor."""
        b, _, h, w = feat.shape
        k, kd = cells.shape[1], self.key_dim
        keys = F.pad(self.key(feat), (RADIUS, RADIUS, RADIUS, RADIUS))  # [B, NH*KD, Hp, Wp]
        hp, wp = h + 2 * RADIUS, w + 2 * RADIUS
        keys = keys.reshape(b, N_HEADS * kd * hp * wp)
        # Window cell j of an actor at (x, y) is padded cell (y + dy_j, x + dx_j).
        pos = (cells[..., 1, None] + self.win_dy) * wp + (cells[..., 0, None] + self.win_dx)  # [B, K, 225]
        chan = heads[..., None] * kd + torch.arange(kd, device=feat.device)  # [B, K, KD]
        index = chan[:, :, None, :] * (hp * wp) + pos[..., None]  # [B, K, 225, KD]
        k_win = keys.gather(1, index.reshape(b, -1)).reshape(b, k, WINDOW * WINDOW, kd)
        q = self.query(hidden).reshape(b, k, N_HEADS, kd)
        q = q.gather(2, heads[..., None, None].expand(b, k, 1, kd)).squeeze(2)  # [B, K, KD]
        return (k_win * q[:, :, None, :]).sum(-1) / math.sqrt(kd)

    def region_logits(self, feat, hidden):
        regions = F.avg_pool2d(feat, REGION, ceil_mode=True)  # [B, ch, rh, rw]
        regions = regions.flatten(2).transpose(1, 2)  # [B, R, ch], row-major like gridnet's regions
        rk = self.region_key(regions)
        rq = self.region_query(hidden)
        return rq @ rk.transpose(1, 2) / math.sqrt(self.key_dim)  # [B, K, R]

    # ---------------------------------------------------------------- policy

    def forward(self, obs: dict, actions=None, greedy: bool = False):
        """
        obs: tensors from storage.pad_observations (planes, globals, cells, valid, type, local,
        build_kind, train_kind, region). Samples actions (or scores the given `actions` [B, K, 5]).
        Returns actions [B, K, 5], log-probability [B], entropy [B], values [B, 2].
        """
        feat, glob, values = self.trunk(obs["planes"], obs["globals"])
        cells, valid = obs["cells"], obs["valid"]
        hidden = self.actor_hidden(feat, glob, cells)

        def choose(logits, given):
            dist = Categorical(logits=logits)
            if given is not None:
                pick = given
            elif greedy:
                pick = logits.argmax(-1)
            else:
                pick = dist.sample()
            return pick, dist.log_prob(pick), dist.entropy()

        a = (lambda i: None if actions is None else actions[..., i])
        t, lp_t, ent_t = choose(masked(self.type_head(hidden), obs["type"]), a(0))
        bk, lp_bk, ent_bk = choose(masked(self.build_head(hidden), obs["build_kind"]), a(3))
        tk, lp_tk, ent_tk = choose(masked(self.train_head(hidden), obs["train_kind"]), a(4))
        region_mask = obs["region"][:, None, :].expand(-1, cells.shape[1], -1)
        r, lp_r, ent_r = choose(masked(self.region_logits(feat, hidden), region_mask), a(2))

        head = self.type_head_of[t]  # [B, K]
        uses_local = head != -1
        head = torch.where(head == -2, FIRST_BUILD_HEAD + bk, head).clamp(min=0)
        local_mask = obs["local"].gather(2, head[..., None, None].expand(*head.shape, 1, obs["local"].shape[-1])).squeeze(2)
        loc, lp_loc, ent_loc = choose(masked(self.local_logits(feat, hidden, cells, head), local_mask), a(1))

        is_build = t == A["build"]
        is_train = t == A["train"]
        uses_region = self.uses_region[t]
        logprob = lp_t + uses_local * lp_loc + uses_region * lp_r + is_build * lp_bk + is_train * lp_tk
        entropy = ent_t + uses_local * ent_loc + uses_region * ent_r + is_build * ent_bk + is_train * ent_tk
        valid_f = valid.float()
        chosen = torch.stack([t, loc, r, bk, tk], dim=-1) * valid[..., None]
        return chosen, (logprob * valid_f).sum(1), (entropy * valid_f).sum(1), values


def to_tensors(batch: dict, device, keys=None) -> dict:
    """NumPy arrays from storage.pad_observations / Rollout.batch -> tensors on `device`."""
    out = {}
    for key, value in batch.items():
        if keys is not None and key not in keys:
            continue
        out[key] = torch.from_numpy(value).to(device, non_blocking=True)
    return out
