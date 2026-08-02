import Phaser from 'phaser';
import {
  chooseOpponentTarget,
  COURT,
  evaluateShot,
  explainOpponentChoice,
} from '../domain/simulation';
import {
  DEFAULT_PROFILE,
  OPPONENTS,
  type Opponent,
  type OpponentId,
  type PlayerProfile,
  type Point,
  type StrokeType,
} from '../domain/types';
import { gameEvents, type GamePhase } from './events';

const WIDTH = 960;
const HEIGHT = 680;
const COURT_BOUNDS = { x: 242, y: 26, width: 476, height: 628 };

export class TennisScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private opponent!: Phaser.GameObjects.Container;
  private ball!: Phaser.GameObjects.Arc;
  private landingMarker!: Phaser.GameObjects.Arc;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private trajectoryGraphics!: Phaser.GameObjects.Graphics;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private playerPosition: Point = { x: 0, y: 9.1 };
  private opponentPosition: Point = { x: 0, y: -9.1 };
  private incomingTarget: Point = { x: 0, y: 8 };
  private phase: GamePhase = 'idle';
  private selectedStroke: StrokeType = 'lifté';
  private opponentProfile: Opponent = OPPONENTS[0];
  private profile: PlayerProfile = DEFAULT_PROFILE;
  private pressStartedAt = 0;
  private rally = 0;
  private seed = 19;

  constructor() {
    super('tennis');
  }

  create() {
    this.drawCourt();
    this.trajectoryGraphics = this.add.graphics();
    this.aimGraphics = this.add.graphics();
    this.landingMarker = this.add.circle(0, 0, 15, 0xe8ff8d, 0.16).setStrokeStyle(2, 0xe8ff8d, 0.7);
    this.landingMarker.setVisible(false);
    this.player = this.createPlayer(0xf4ffdd, 0x102a21);
    this.opponent = this.createPlayer(0xffc6a5, 0x2d1710);
    this.ball = this.add.circle(0, 0, 7, 0xe9ff55).setStrokeStyle(2, 0x18221c, 0.7);
    this.syncActors();

    this.cursors = this.input.keyboard?.createCursorKeys();
    if (this.input.keyboard) {
      this.wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    }

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    gameEvents.on('command:start', this.startRally, this);
    gameEvents.on('command:stroke', this.setStroke, this);
    gameEvents.on('command:opponent', this.setOpponent, this);
    gameEvents.on('command:profile', this.setProfile, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp, this);

    this.publish('Appuie sur « Lancer un échange » pour commencer.');
  }

  update(_time: number, delta: number) {
    if (this.phase !== 'decision') return;
    const speed = (5.4 + this.profile.agility * 0.65) * (delta / 1000);
    const left = this.cursors?.left.isDown || this.wasd?.left.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.right.isDown;
    const up = this.cursors?.up.isDown || this.wasd?.up.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.down.isDown;

    if (left) this.playerPosition.x -= speed;
    if (right) this.playerPosition.x += speed;
    if (up) this.playerPosition.y -= speed;
    if (down) this.playerPosition.y += speed;
    this.playerPosition.x = Phaser.Math.Clamp(this.playerPosition.x, -4.6, 4.6);
    this.playerPosition.y = Phaser.Math.Clamp(this.playerPosition.y, 1.1, 11.1);
    this.syncActors();
  }

  private drawCourt() {
    this.cameras.main.setBackgroundColor('#071612');
    const g = this.add.graphics();
    g.fillStyle(0x0d211b, 1);
    g.fillRoundedRect(72, 14, WIDTH - 144, HEIGHT - 28, 28);
    g.fillStyle(0xbd6247, 1);
    g.fillRoundedRect(
      COURT_BOUNDS.x - 42,
      COURT_BOUNDS.y,
      COURT_BOUNDS.width + 84,
      COURT_BOUNDS.height,
      10,
    );
    g.fillStyle(0x2d7b68, 1);
    g.fillRect(COURT_BOUNDS.x, COURT_BOUNDS.y, COURT_BOUNDS.width, COURT_BOUNDS.height);
    g.lineStyle(3, 0xf3f0df, 0.92);
    g.strokeRect(COURT_BOUNDS.x, COURT_BOUNDS.y, COURT_BOUNDS.width, COURT_BOUNDS.height);
    g.lineBetween(COURT_BOUNDS.x, HEIGHT / 2, COURT_BOUNDS.x + COURT_BOUNDS.width, HEIGHT / 2);

    const serviceTop = this.worldToScreen({ x: 0, y: -6.4 }).y;
    const serviceBottom = this.worldToScreen({ x: 0, y: 6.4 }).y;
    const centerX = WIDTH / 2;
    g.lineBetween(COURT_BOUNDS.x, serviceTop, COURT_BOUNDS.x + COURT_BOUNDS.width, serviceTop);
    g.lineBetween(COURT_BOUNDS.x, serviceBottom, COURT_BOUNDS.x + COURT_BOUNDS.width, serviceBottom);
    g.lineBetween(centerX, serviceTop, centerX, serviceBottom);
    g.lineStyle(5, 0xf8f5e9, 0.95);
    g.lineBetween(COURT_BOUNDS.x - 10, HEIGHT / 2, COURT_BOUNDS.x + COURT_BOUNDS.width + 10, HEIGHT / 2);
    g.lineStyle(1, 0x071612, 0.45);
    for (let x = COURT_BOUNDS.x - 10; x < COURT_BOUNDS.x + COURT_BOUNDS.width + 10; x += 12) {
      g.lineBetween(x, HEIGHT / 2 - 7, x, HEIGHT / 2 + 7);
    }
  }

  private createPlayer(fill: number, stroke: number) {
    const shadow = this.add.ellipse(0, 14, 36, 14, 0x000000, 0.22);
    const body = this.add.circle(0, 0, 17, fill).setStrokeStyle(4, stroke, 0.9);
    const marker = this.add.circle(0, 0, 5, stroke, 0.85);
    return this.add.container(0, 0, [shadow, body, marker]);
  }

  private startRally() {
    if (this.phase === 'opponent' || this.phase === 'player') return;
    this.rally = 0;
    this.playerPosition = { x: 0, y: 9.1 };
    this.opponentPosition = { x: 0, y: -9.1 };
    this.syncActors();
    this.playOpponentShot();
  }

  private playOpponentShot() {
    this.phase = 'opponent';
    this.rally += 1;
    this.incomingTarget = chooseOpponentTarget(
      this.opponentProfile,
      this.playerPosition,
      this.random(),
    );
    this.publish(`${this.opponentProfile.name} prépare sa frappe…`);
    gameEvents.emit(
      'game:opponent-explanation',
      explainOpponentChoice(this.opponentProfile, this.incomingTarget),
    );
    const from = { ...this.opponentPosition };
    this.animateBall(from, this.incomingTarget, 760, () => {
      this.phase = 'decision';
      this.landingMarker.setVisible(true);
      const marker = this.worldToScreen(this.incomingTarget);
      this.landingMarker.setPosition(marker.x, marker.y);
      this.publish('Déplace-toi, vise dans le camp adverse, maintiens puis relâche.');
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    if (this.phase !== 'decision') return;
    this.pressStartedAt = pointer.downTime;
    this.drawAim(pointer.x, pointer.y);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (this.phase !== 'decision' || !pointer.isDown) return;
    this.drawAim(pointer.x, pointer.y);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if (this.phase !== 'decision' || !this.pressStartedAt) return;
    const target = this.screenToWorld(pointer.x, pointer.y);
    const held = Math.max(0, pointer.upTime - this.pressStartedAt);
    const power = Phaser.Math.Clamp(0.38 + held / 1350, 0.38, 1);
    this.pressStartedAt = 0;
    this.aimGraphics.clear();
    this.landingMarker.setVisible(false);
    this.playPlayerShot(target, power);
  }

  private playPlayerShot(target: Point, power: number) {
    this.phase = 'player';
    const feedback = evaluateShot(
      target,
      this.playerPosition,
      this.opponentPosition,
      this.selectedStroke,
      power,
      this.profile,
    );
    this.publish('Ta balle traverse le court…');
    this.animateBall(this.incomingTarget, target, 620 - power * 150, () => {
      this.phase = 'feedback';
      gameEvents.emit('game:feedback', feedback);
      this.publish(
        feedback.verdict === 'faute'
          ? 'Point terminé. Observe la marge avant de recommencer.'
          : 'Analyse ton choix, puis poursuis l’échange.',
      );
      if (feedback.verdict !== 'faute') {
        this.opponentPosition = {
          x: Phaser.Math.Clamp(target.x * 0.78, -3.7, 3.7),
          y: -8.8,
        };
        this.syncActors();
        this.time.delayedCall(1350, () => this.playOpponentShot());
      }
    });
  }

  private animateBall(from: Point, to: Point, duration: number, done: () => void) {
    const fromScreen = this.worldToScreen(from);
    const toScreen = this.worldToScreen(to);
    this.ball.setPosition(fromScreen.x, fromScreen.y);
    this.ball.setVisible(true);
    this.trajectoryGraphics.clear();
    this.trajectoryGraphics.lineStyle(2, 0xe9ff55, 0.24);
    this.trajectoryGraphics.lineBetween(fromScreen.x, fromScreen.y, toScreen.x, toScreen.y);
    const progress = { value: 0 };
    this.tweens.add({
      targets: progress,
      value: 1,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const x = Phaser.Math.Linear(fromScreen.x, toScreen.x, progress.value);
        const baseY = Phaser.Math.Linear(fromScreen.y, toScreen.y, progress.value);
        const arc = Math.sin(progress.value * Math.PI) * 38;
        this.ball.setPosition(x, baseY - arc);
        this.ball.setScale(1 + Math.sin(progress.value * Math.PI) * 0.45);
      },
      onComplete: () => {
        this.ball.setScale(1);
        this.trajectoryGraphics.clear();
        done();
      },
    });
  }

  private drawAim(x: number, y: number) {
    const start = this.worldToScreen(this.incomingTarget);
    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(4, 0xe9ff55, 0.8);
    this.aimGraphics.lineBetween(start.x, start.y, x, y);
    this.aimGraphics.fillStyle(0xe9ff55, 0.22);
    this.aimGraphics.fillCircle(x, y, 17);
  }

  private setStroke(stroke: StrokeType) {
    this.selectedStroke = stroke;
  }

  private setOpponent(id: OpponentId) {
    this.opponentProfile = OPPONENTS.find((opponent) => opponent.id === id) ?? OPPONENTS[0];
  }

  private setProfile(profile: PlayerProfile) {
    this.profile = profile;
  }

  private publish(instruction: string) {
    gameEvents.emit('game:snapshot', {
      phase: this.phase,
      instruction,
      rally: this.rally,
    });
  }

  private syncActors() {
    const player = this.worldToScreen(this.playerPosition);
    const opponent = this.worldToScreen(this.opponentPosition);
    this.player?.setPosition(player.x, player.y);
    this.opponent?.setPosition(opponent.x, opponent.y);
  }

  private worldToScreen(point: Point) {
    return {
      x: WIDTH / 2 + (point.x / COURT.halfWidth) * (COURT_BOUNDS.width / 2),
      y: HEIGHT / 2 + (point.y / COURT.halfLength) * (COURT_BOUNDS.height / 2),
    };
  }

  private screenToWorld(x: number, y: number): Point {
    return {
      x: ((x - WIDTH / 2) / (COURT_BOUNDS.width / 2)) * COURT.halfWidth,
      y: ((y - HEIGHT / 2) / (COURT_BOUNDS.height / 2)) * COURT.halfLength,
    };
  }

  private random() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  private cleanUp() {
    gameEvents.off('command:start', this.startRally, this);
    gameEvents.off('command:stroke', this.setStroke, this);
    gameEvents.off('command:opponent', this.setOpponent, this);
    gameEvents.off('command:profile', this.setProfile, this);
  }
}

export const gameConfig = (parent: HTMLElement): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#071612',
  scene: [TennisScene],
  render: { antialias: true, pixelArt: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
