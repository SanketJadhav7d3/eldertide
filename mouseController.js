
export default class InputController {
  constructor(scene) {
    this.scene = scene;
    this.pathLayer = scene.pathLayer; // Assuming pathLayer is stored on the scene

    // Properties moved from VillageScene
    this.selectionRect = new Phaser.Geom.Rectangle(0, 0, 0, 0);
    this.isDragging = false;
    this.graphics = scene.add.graphics().setDepth(9999);
    this.previousMidpoint = null;
    this.scene.game.origDragPoint = null;

    // Keyboard controls
    this.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.cameraSpeed = 10;

    // Selection rectangle corner images
    this.cornerImages = {
      tl: scene.add.sprite(0, 0, 'corner-tl').setVisible(false).setDepth(10000).setScale(1.6),
      tr: scene.add.sprite(0, 0, 'corner-tr').setVisible(false).setDepth(10000).setScale(1.6),
      bl: scene.add.sprite(0, 0, 'corner-bl').setVisible(false).setDepth(10000).setScale(1.6),
      br: scene.add.sprite(0, 0, 'corner-br').setVisible(false).setDepth(10000).setScale(1.6)
    };

    // Tween for corner images
    scene.tweens.add({
      targets: Object.values(this.cornerImages),
      scaleX: 1.8,
      scaleY: 1.8,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Set up input event listeners
    this.scene.input.on('pointerdown', this.handlePointerDown, this);
    this.scene.input.on('pointermove', this.handlePointerMove, this);
    this.scene.input.on('pointerup', this.handlePointerUp, this);
  }

  handlePointerDown(pointer) {
    if (pointer.leftButtonDown()) {
      this.isDragging = true;
      this.selectionRect.x = pointer.worldX;
      this.selectionRect.y = pointer.worldY;
    } else if (pointer.rightButtonDown()) {
      this.handleUnitMovement(pointer);
    }
  }

  handlePointerMove(pointer) {
    if (this.scene.input.pointer1.isDown && this.scene.input.pointer2.isDown) {
      const midpoint = new Phaser.Math.Vector2(
        (this.scene.input.pointer1.x + this.scene.input.pointer2.x) / 2,
        (this.scene.input.pointer1.y + this.scene.input.pointer2.y) / 2
      );

      if (this.previousMidpoint) {
        const dx = midpoint.x - this.previousMidpoint.x;
        const dy = midpoint.y - this.previousMidpoint.y;
        this.scene.cameras.main.scrollX -= dx;
        this.scene.cameras.main.scrollY -= dy;
      }
      this.previousMidpoint = midpoint;
    } else {
      this.previousMidpoint = null;
    }

    if (!this.isDragging || !pointer.leftButtonDown()) return;

    this.selectionRect.width = pointer.worldX - this.selectionRect.x;
    this.selectionRect.height = pointer.worldY - this.selectionRect.y;
    this.drawSelectionRectangle();
  }

  handlePointerUp(pointer) {
    if (pointer.leftButtonReleased()) {
      if (this.isDragging) {
        if (this.selectionRect.width < 0) {
          this.selectionRect.x += this.selectionRect.width;
          this.selectionRect.width *= -1;
        }
        if (this.selectionRect.height < 0) {
          this.selectionRect.y += this.selectionRect.height;
          this.selectionRect.height *= -1;
        }

        const dragThreshold = 5;
        if (this.selectionRect.width > dragThreshold || this.selectionRect.height > dragThreshold) {
          this.scene.handleUnitSelection(pointer, true); // Multi-selection
        } else {
          this.scene.handleUnitSelection(pointer, false); // Single-selection
        }
      }
      this.isDragging = false;
      this.graphics.clear();
      this.selectionRect.width = 0;
      this.selectionRect.height = 0;
      Object.values(this.cornerImages).forEach(img => img.setVisible(false));
    }
  }

  handleUnitMovement(pointer) {
    const targetX = this.pathLayer.worldToTileX(pointer.worldX);
    const targetY = this.pathLayer.worldToTileY(pointer.worldY);

    const formationSize = Math.ceil(Math.sqrt(this.scene.selectedUnits.getLength()));
    let unitIndex = 0;

    console.log('move', targetX, targetY);

    this.scene.selectedUnits.getChildren().forEach(unit => {
      const offsetX = unitIndex % formationSize;
      const offsetY = Math.floor(unitIndex / formationSize);
      unit.moveToTile(targetX + offsetX, targetY + offsetY, unit.grid);
      unitIndex++;
    });
  }

  drawSelectionRectangle() {
    this.graphics.clear();
    if (this.spaceKey.isDown) return;

    this.graphics.fillStyle(0xFFD966, 0.3);
    this.graphics.fillRectShape(this.selectionRect);
    this.graphics.strokeRectShape(this.selectionRect);

    const rect = this.selectionRect;
    const left = Math.min(rect.x, rect.x + rect.width);
    const right = Math.max(rect.x, rect.x + rect.width);
    const top = Math.min(rect.y, rect.y + rect.height);
    const bottom = Math.max(rect.y, rect.y + rect.height);

    this.cornerImages.tl.setPosition(left, top).setVisible(true);
    this.cornerImages.tr.setPosition(right, top).setVisible(true);
    this.cornerImages.bl.setPosition(left, bottom).setVisible(true);
    this.cornerImages.br.setPosition(right, bottom).setVisible(true);
  }

  update(time, delta) {
    if (this.cursors.left.isDown) {
      this.scene.cameras.main.scrollX -= this.cameraSpeed;
    } else if (this.cursors.right.isDown) {
      this.scene.cameras.main.scrollX += this.cameraSpeed;
    }

    if (this.cursors.up.isDown) {
      this.scene.cameras.main.scrollY -= this.cameraSpeed;
    } else if (this.cursors.down.isDown) {
      this.scene.cameras.main.scrollY += this.cameraSpeed;
    }

    if (this.spaceKey.isDown) {
      if (this.scene.input.activePointer.isDown) {
        if (this.scene.game.origDragPoint) {
          this.scene.cameras.main.scrollX += this.scene.game.origDragPoint.x - this.scene.input.activePointer.position.x;
          this.scene.cameras.main.scrollY += this.scene.game.origDragPoint.y - this.scene.input.activePointer.position.y;
        }
        this.scene.game.origDragPoint = this.scene.input.activePointer.position.clone();
      } else {
        this.scene.game.origDragPoint = null;
      }
    }
  }
}
