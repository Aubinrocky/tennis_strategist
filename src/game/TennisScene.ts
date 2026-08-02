import Phaser from 'phaser';
import {
  analyseContact,
  chooseOpponentShot,
  COURT,
  resolvePlayerShot,
  type ContactAnalysis,
  type OpponentShot,
} from '../domain/simulation';
import {
  DEFAULT_PROFILE,
  OPPONENTS,
  type Opponent,
  type OpponentId,
  type PlayerProfile,
  type Point,
  type StrokeType,
  type TacticalFeedback,
  type TrajectoryProfile,
} from '../domain/types';
import { gameEvents, type GamePhase } from './events';

const WIDTH = 1100;
const HEIGHT = 720;
const VIEW = { top: 54, bottom: 704, farWidth: 260, nearWidth: 850, worldHalfWidth: 6.7 };
const RESPONSE_WINDOW = 520;

export class TennisScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private opponent!: Phaser.GameObjects.Container;
  private ball!: Phaser.GameObjects.Arc;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private landingMarker!: Phaser.GameObjects.Arc;
  private intendedMarker!: Phaser.GameObjects.Arc;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private trajectoryGraphics!: Phaser.GameObjects.Graphics;
  private activeBallTween?: Phaser.Tweens.Tween;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private playerPosition: Point = { x: 0, y: 13.5 };
  private opponentPosition: Point = { x: 0, y: -13.2 };
  private incomingTarget: Point = { x: 0, y: 9 };
  private phase: GamePhase = 'idle';
  private selectedStroke: StrokeType = 'lifté';
  private opponentProfile: Opponent = OPPONENTS[0];
  private profile: PlayerProfile = DEFAULT_PROFILE;
  private pressStartedAt = 0;
  private incomingArrivalAt = 0;
  private responseDeadline = 0;
  private rally = 0;
  private pointNumber = 0;
  private lastPressure = 0;
  private seed = 19;
  private lastSnapshotAt = 0;

  constructor() {
    super('tennis');
  }

  create() {
    this.drawCourt();
    this.trajectoryGraphics = this.add.graphics().setDepth(6);
    this.aimGraphics = this.add.graphics().setDepth(7);
    this.landingMarker = this.add.circle(0, 0, 19, 0xffa16f, 0.12).setStrokeStyle(2, 0xffa16f, 0.75).setDepth(4);
    this.intendedMarker = this.add.circle(0, 0, 16, 0xe8ff8d, 0.13).setStrokeStyle(2, 0xe8ff8d, 0.8).setDepth(5);
    this.landingMarker.setVisible(false);
    this.intendedMarker.setVisible(false);
    this.player = this.createPlayer(0xf4ffdd, 0x102a21);
    this.opponent = this.createPlayer(0xffc6a5, 0x2d1710);
    this.ballShadow = this.add.ellipse(0, 0, 18, 7, 0x000000, 0.32).setDepth(8);
    this.ball = this.add.circle(0, 0, 7, 0xe9ff55).setStrokeStyle(2, 0x18221c, 0.7).setDepth(12);
    this.ball.setVisible(false);
    this.ballShadow.setVisible(false);
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
    gameEvents.on('command:start', this.startPoint, this);
    gameEvents.on('command:stroke', this.setStroke, this);
    gameEvents.on('command:opponent', this.setOpponent, this);
    gameEvents.on('command:profile', this.setProfile, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanUp, this);

    this.publish('La simulation démarre : replace-toi derrière la ligne de fond.');
  }

  update(time: number, delta: number) {
    const canMove =
      this.phase === 'opponent' ||
      this.phase === 'decision' ||
      this.phase === 'player' ||
      this.phase === 'feedback';
    if (!canMove) return;
    const speed = (5.7 + this.profile.agility * 0.62) * (delta / 1000);
    const left = this.cursors?.left.isDown || this.wasd?.left.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.right.isDown;
    const up = this.cursors?.up.isDown || this.wasd?.up.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.down.isDown;

    if (left) this.playerPosition.x -= speed;
    if (right) this.playerPosition.x += speed;
    if (up) this.playerPosition.y -= speed;
    if (down) this.playerPosition.y += speed;
    this.playerPosition.x = Phaser.Math.Clamp(this.playerPosition.x, -5.75, 5.75);
    this.playerPosition.y = Phaser.Math.Clamp(this.playerPosition.y, 0.9, COURT.runOff - 0.45);
    this.syncActors();

    if (this.phase === 'decision') {
      const remaining = Math.max(0, this.responseDeadline - time);
      const contact = this.currentContact(time);
      if (time - this.lastSnapshotAt > 90) {
        this.lastSnapshotAt = time;
        this.publish('Frappe maintenant : ta fenêtre de contact se referme.', contact.label, remaining);
      }
      if (remaining <= 0) this.missIncomingBall();
    }
  }

  private drawCourt() {
    this.cameras.main.setBackgroundColor('#06130f');
    const g = this.add.graphics();
    const farLeft = this.worldToScreen({ x: -VIEW.worldHalfWidth, y: -COURT.runOff });
    const farRight = this.worldToScreen({ x: VIEW.worldHalfWidth, y: -COURT.runOff });
    const nearLeft = this.worldToScreen({ x: -VIEW.worldHalfWidth, y: COURT.runOff });
    const nearRight = this.worldToScreen({ x: VIEW.worldHalfWidth, y: COURT.runOff });

    g.fillStyle(0x081914, 1);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0xa9553f, 1);
    g.fillPoints([farLeft, farRight, nearRight, nearLeft], true);

    const court = [
      this.worldToScreen({ x: -COURT.halfWidth, y: -COURT.halfLength }),
      this.worldToScreen({ x: COURT.halfWidth, y: -COURT.halfLength }),
      this.worldToScreen({ x: COURT.halfWidth, y: COURT.halfLength }),
      this.worldToScreen({ x: -COURT.halfWidth, y: COURT.halfLength }),
    ];
    g.fillStyle(0x28735f, 1);
    g.fillPoints(court, true);
    g.lineStyle(3, 0xf4f0df, 0.94);
    this.drawWorldLine(g, { x: -COURT.halfWidth, y: -COURT.halfLength }, { x: COURT.halfWidth, y: -COURT.halfLength });
    this.drawWorldLine(g, { x: -COURT.halfWidth, y: COURT.halfLength }, { x: COURT.halfWidth, y: COURT.halfLength });
    this.drawWorldLine(g, { x: -COURT.halfWidth, y: -COURT.halfLength }, { x: -COURT.halfWidth, y: COURT.halfLength });
    this.drawWorldLine(g, { x: COURT.halfWidth, y: -COURT.halfLength }, { x: COURT.halfWidth, y: COURT.halfLength });
    this.drawWorldLine(g, { x: -COURT.halfWidth, y: -6.4 }, { x: COURT.halfWidth, y: -6.4 });
    this.drawWorldLine(g, { x: -COURT.halfWidth, y: 6.4 }, { x: COURT.halfWidth, y: 6.4 });
    this.drawWorldLine(g, { x: 0, y: -6.4 }, { x: 0, y: 6.4 });

    const netLeft = this.worldToScreen({ x: -5.05, y: 0 });
    const netRight = this.worldToScreen({ x: 5.05, y: 0 });
    g.lineStyle(10, 0x06100d, 0.3);
    g.lineBetween(netLeft.x, netLeft.y + 9, netRight.x, netRight.y + 9);
    g.lineStyle(4, 0xf6f1de, 0.96);
    g.lineBetween(netLeft.x, netLeft.y - 10, netRight.x, netRight.y - 10);
    g.lineStyle(1, 0xd6d8ce, 0.36);
    for (let x = netLeft.x; x <= netRight.x; x += 13) g.lineBetween(x, netLeft.y - 9, x, netLeft.y + 10);
    g.lineBetween(netLeft.x, netLeft.y, netRight.x, netRight.y);

    g.lineStyle(1, 0xf2d1c8, 0.22);
    this.drawWorldLine(g, { x: -VIEW.worldHalfWidth, y: 13.55 }, { x: VIEW.worldHalfWidth, y: 13.55 });
    this.drawWorldLine(g, { x: -VIEW.worldHalfWidth, y: -13.55 }, { x: VIEW.worldHalfWidth, y: -13.55 });

    const nearLabel = this.add.text(48, HEIGHT - 48, 'ZONE DE REPLACEMENT · FOND DE COURT', {
      fontFamily: 'DM Sans', fontSize: '10px', color: '#f0b6a3', letterSpacing: 1.5,
    }).setAlpha(0.58);
    nearLabel.setDepth(2);
  }

  private drawWorldLine(g: Phaser.GameObjects.Graphics, from: Point, to: Point) {
    const a = this.worldToScreen(from);
    const b = this.worldToScreen(to);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }

  private createPlayer(fill: number, stroke: number) {
    const shadow = this.add.ellipse(0, 15, 36, 13, 0x000000, 0.24);
    const body = this.add.circle(0, 0, 16, fill).setStrokeStyle(4, stroke, 0.9);
    const shoulders = this.add.rectangle(0, 12, 30, 10, fill, 0.9).setStrokeStyle(2, stroke, 0.75);
    const marker = this.add.circle(0, -2, 4, stroke, 0.85);
    return this.add.container(0, 0, [shadow, shoulders, body, marker]).setDepth(10);
  }

  private startPoint() {
    if (this.phase === 'opponent' || this.phase === 'decision' || this.phase === 'player') return;
    this.pointNumber += 1;
    this.rally = 0;
    this.lastPressure = 0;
    this.pressStartedAt = 0;
    this.aimGraphics.clear();
    this.landingMarker.setVisible(false);
    this.intendedMarker.setVisible(false);
    this.playerPosition = { x: 0, y: 13.5 };
    this.opponentPosition = { x: 0, y: -13.2 };
    this.syncActors();
    this.playOpponentShot();
  }

  private playOpponentShot() {
    this.phase = 'opponent';
    this.rally += 1;
    const shot = chooseOpponentShot(
      this.opponentProfile,
      this.playerPosition,
      this.lastPressure,
      [this.random(), this.random(), this.random()],
    );
    this.incomingTarget = shot.actualTarget;
    this.incomingArrivalAt = this.time.now + shot.duration;
    this.responseDeadline = this.incomingArrivalAt + RESPONSE_WINDOW;
    this.publish(
      `${this.opponentProfile.name} frappe ${shot.trajectory.spin} : cours pendant que la balle voyage.`,
      'Balle en approche',
      shot.duration,
    );
    gameEvents.emit('game:opponent-explanation', shot.explanation);
    this.landingMarker.setVisible(true);
    const marker = this.worldToScreen(shot.actualTarget);
    this.landingMarker.setPosition(marker.x, marker.y);
    this.animateOpponentRecovery(shot);
    this.animateBall(this.opponentPosition, shot.actualTarget, shot.duration, shot.trajectory, () => {
      if (shot.isFault) {
        this.landingMarker.setVisible(false);
        this.finishPoint(`${this.opponentProfile.name} fait faute. Point gagné.`);
        return;
      }
      this.phase = 'decision';
      const contact = this.currentContact(this.time.now);
      this.publish('La balle est dans ta zone : vise et relâche sans attendre.', contact.label, RESPONSE_WINDOW);
    });
  }

  private animateOpponentRecovery(shot: OpponentShot) {
    const targetX = Phaser.Math.Clamp(shot.target.x * 0.2, -1.1, 1.1);
    const startX = this.opponentPosition.x;
    const progress = { value: 0 };
    this.tweens.add({
      targets: progress,
      value: 1,
      duration: shot.duration * 0.82,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.opponentPosition.x = Phaser.Math.Linear(startX, targetX, progress.value);
        this.syncActors();
      },
    });
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    const earlyWindowOpen =
      this.phase === 'opponent' && this.incomingArrivalAt - this.time.now <= 300;
    if (this.phase !== 'decision' && !earlyWindowOpen) return;
    this.pressStartedAt = pointer.downTime;
    this.drawAim(pointer.x, pointer.y);
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if ((this.phase !== 'decision' && this.phase !== 'opponent') || !pointer.isDown) return;
    this.drawAim(pointer.x, pointer.y);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    if ((this.phase !== 'decision' && this.phase !== 'opponent') || !this.pressStartedAt) return;
    if (this.phase === 'opponent' && this.incomingArrivalAt - this.time.now > 240) {
      this.pressStartedAt = 0;
      this.aimGraphics.clear();
      this.publish('Trop tôt : continue ta course et prépare la cible avant le contact.', 'Balle encore trop loin', this.incomingArrivalAt - this.time.now);
      return;
    }
    const intendedTarget = this.screenToWorld(pointer.x, pointer.y);
    const held = Math.max(0, pointer.upTime - this.pressStartedAt);
    const power = Phaser.Math.Clamp(0.38 + held / 900, 0.38, 1);
    const contact = this.currentContact(this.time.now);
    this.pressStartedAt = 0;
    this.aimGraphics.clear();
    this.landingMarker.setVisible(false);
    this.playPlayerShot(intendedTarget, power, contact);
  }

  private playPlayerShot(intendedTarget: Point, power: number, contact: ContactAnalysis) {
    this.phase = 'player';
    const resolution = resolvePlayerShot(
      intendedTarget,
      this.playerPosition,
      this.opponentPosition,
      this.selectedStroke,
      power,
      this.profile,
      contact,
      this.random(),
      this.random(),
    );
    const feedback = resolution.feedback;
    const intended = this.worldToScreen(intendedTarget);
    this.intendedMarker.setPosition(intended.x, intended.y).setVisible(true);

    if (feedback.outcome === 'miss') {
      this.emitFeedbackAndFinish(feedback, 'Tu ne touches pas la balle. Point perdu.');
      return;
    }

    let flightTarget = resolution.actualTarget;
    if (feedback.outcome === 'net') {
      const ratioToNet = this.playerPosition.y / (this.playerPosition.y - resolution.actualTarget.y);
      flightTarget = {
        x: Phaser.Math.Linear(this.playerPosition.x, resolution.actualTarget.x, ratioToNet),
        y: 0.25,
      };
    }
    const duration = Math.round(780 - resolution.trajectory.pace * 250);
    this.publish(`${contact.label}. La dispersion décide maintenant de la balle réelle.`);
    this.animateBall(this.incomingTarget, flightTarget, duration, resolution.trajectory, () => {
      gameEvents.emit('game:feedback', feedback);
      this.intendedMarker.setVisible(false);
      if (feedback.verdict === 'faute') {
        this.finishPoint(feedback.outcome === 'net' ? 'Balle dans le filet. Point perdu.' : 'Balle dehors. Point perdu.');
        return;
      }

      this.lastPressure = feedback.pressure ?? 0;
      this.opponentPosition = {
        x: Phaser.Math.Clamp(resolution.actualTarget.x * 0.9, -4.2, 4.2),
        y: Phaser.Math.Clamp(resolution.actualTarget.y - 2.15, -COURT.runOff + 0.6, -7.2),
      };
      this.syncActors();
      this.phase = 'feedback';
      this.publish(`Balle bonne · ${this.lastPressure} % de pression. Replace-toi immédiatement.`);
      this.time.delayedCall(520, () => this.playOpponentShot());
    });
  }

  private missIncomingBall() {
    if (this.phase !== 'decision') return;
    const contact = analyseContact(
      Phaser.Math.Distance.Between(
        this.playerPosition.x,
        this.playerPosition.y,
        this.incomingTarget.x,
        this.incomingTarget.y,
      ),
      RESPONSE_WINDOW + 1,
      this.profile,
    );
    const feedback = resolvePlayerShot(
      { x: 0, y: -7 },
      this.playerPosition,
      this.opponentPosition,
      this.selectedStroke,
      0.4,
      this.profile,
      contact,
      0.5,
      0.5,
    ).feedback;
    this.emitFeedbackAndFinish(feedback, 'Deuxième rebond : balle manquée. Point perdu.');
  }

  private emitFeedbackAndFinish(feedback: TacticalFeedback, message: string) {
    gameEvents.emit('game:feedback', feedback);
    this.landingMarker.setVisible(false);
    this.intendedMarker.setVisible(false);
    this.finishPoint(message);
  }

  private finishPoint(message: string) {
    this.phase = 'point-over';
    this.pressStartedAt = 0;
    this.aimGraphics.clear();
    this.publish(`${message} Prends le temps de lire l’analyse, puis lance un nouveau point.`);
  }

  private currentContact(now: number) {
    const distance = Phaser.Math.Distance.Between(
      this.playerPosition.x,
      this.playerPosition.y,
      this.incomingTarget.x,
      this.incomingTarget.y,
    );
    return analyseContact(distance, now - this.incomingArrivalAt, this.profile);
  }

  private animateBall(
    from: Point,
    to: Point,
    duration: number,
    trajectory: TrajectoryProfile,
    done: () => void,
  ) {
    this.activeBallTween?.stop();
    const fromScreen = this.worldToScreen(from);
    this.ball.setPosition(fromScreen.x, fromScreen.y).setVisible(true);
    this.ballShadow.setPosition(fromScreen.x, fromScreen.y + 5).setVisible(true);
    this.drawTrajectory(from, to, trajectory);
    const progress = { value: 0 };
    this.activeBallTween = this.tweens.add({
      targets: progress,
      value: 1,
      duration,
      ease: 'Linear',
      onUpdate: () => {
        const world = {
          x: Phaser.Math.Linear(from.x, to.x, progress.value),
          y: Phaser.Math.Linear(from.y, to.y, progress.value),
        };
        const floor = this.worldToScreen(world);
        const height = Math.sin(progress.value * Math.PI) * (54 + trajectory.arc * 125);
        const depthScale = this.depthScale(world.y);
        this.ballShadow.setPosition(floor.x, floor.y + 4).setScale(depthScale, depthScale * 0.75);
        this.ball.setPosition(floor.x, floor.y - height * depthScale).setScale(depthScale * (1 + trajectory.pace * 0.12));
      },
      onComplete: () => {
        this.ball.setScale(1);
        this.ballShadow.setVisible(false);
        this.trajectoryGraphics.clear();
        done();
      },
    });
  }

  private drawTrajectory(from: Point, to: Point, trajectory: TrajectoryProfile) {
    this.trajectoryGraphics.clear();
    const color = trajectory.spin === 'lifté' ? 0xe9ff55 : trajectory.spin === 'slice' ? 0x70ddff : 0xffbf82;
    this.trajectoryGraphics.lineStyle(2, color, 0.3);
    this.trajectoryGraphics.beginPath();
    for (let index = 0; index <= 20; index += 1) {
      const t = index / 20;
      const world = { x: Phaser.Math.Linear(from.x, to.x, t), y: Phaser.Math.Linear(from.y, to.y, t) };
      const floor = this.worldToScreen(world);
      const height = Math.sin(t * Math.PI) * (54 + trajectory.arc * 125) * this.depthScale(world.y);
      if (index === 0) this.trajectoryGraphics.moveTo(floor.x, floor.y - height);
      else this.trajectoryGraphics.lineTo(floor.x, floor.y - height);
    }
    this.trajectoryGraphics.strokePath();
  }

  private drawAim(x: number, y: number) {
    const target = this.screenToWorld(x, y);
    const clampedTarget = { x: target.x, y: Math.min(-0.45, target.y) };
    const screenTarget = this.worldToScreen(clampedTarget);
    const start = this.worldToScreen(this.incomingTarget);
    this.aimGraphics.clear();
    this.aimGraphics.lineStyle(3, 0xe9ff55, 0.75);
    this.aimGraphics.lineBetween(start.x, start.y, screenTarget.x, screenTarget.y);
    this.aimGraphics.fillStyle(0xe9ff55, 0.18);
    this.aimGraphics.fillCircle(screenTarget.x, screenTarget.y, 17);
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

  private publish(instruction: string, contactLabel?: string, timeLeft?: number) {
    gameEvents.emit('game:snapshot', {
      phase: this.phase,
      instruction,
      rally: this.rally,
      contactLabel,
      timeLeft,
    });
  }

  private syncActors() {
    const player = this.worldToScreen(this.playerPosition);
    const opponent = this.worldToScreen(this.opponentPosition);
    const playerScale = this.depthScale(this.playerPosition.y);
    const opponentScale = this.depthScale(this.opponentPosition.y);
    this.player?.setPosition(player.x, player.y).setScale(playerScale).setDepth(10 + this.playerPosition.y);
    this.opponent?.setPosition(opponent.x, opponent.y).setScale(opponentScale).setDepth(10 + this.opponentPosition.y);
  }

  private depthScale(y: number) {
    const t = Phaser.Math.Clamp((y + COURT.runOff) / (COURT.runOff * 2), 0, 1);
    return 0.56 + t * 0.62;
  }

  private worldToScreen(point: Point) {
    const t = Phaser.Math.Clamp((point.y + COURT.runOff) / (COURT.runOff * 2), 0, 1);
    const perspectiveT = Math.pow(t, 1.08);
    const width = Phaser.Math.Linear(VIEW.farWidth, VIEW.nearWidth, perspectiveT);
    return {
      x: WIDTH / 2 + (point.x / VIEW.worldHalfWidth) * (width / 2),
      y: Phaser.Math.Linear(VIEW.top, VIEW.bottom, perspectiveT),
    };
  }

  private screenToWorld(x: number, y: number): Point {
    const perspectiveT = Phaser.Math.Clamp((y - VIEW.top) / (VIEW.bottom - VIEW.top), 0, 1);
    const t = Math.pow(perspectiveT, 1 / 1.08);
    const width = Phaser.Math.Linear(VIEW.farWidth, VIEW.nearWidth, perspectiveT);
    return {
      x: ((x - WIDTH / 2) / (width / 2)) * VIEW.worldHalfWidth,
      y: t * COURT.runOff * 2 - COURT.runOff,
    };
  }

  private random() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  private cleanUp() {
    gameEvents.off('command:start', this.startPoint, this);
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
  backgroundColor: '#06130f',
  scene: [TennisScene],
  render: { antialias: true, pixelArt: false },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});
