"""Optimisations must not change any game: replay recorded games and compare every decision."""

from replay import check


def test_games_match_the_recorded_ones():
    assert check()
