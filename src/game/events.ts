import Phaser from 'phaser';
import type {
  OpponentId,
  PlayerProfile,
  StrokeType,
  TacticalFeedback,
} from '../domain/types';

export type GamePhase = 'idle' | 'opponent' | 'bounce' | 'decision' | 'player' | 'feedback' | 'point-over';

export type GameSnapshot = {
  phase: GamePhase;
  instruction: string;
  rally: number;
  contactLabel?: string;
  timeLeft?: number;
  timeTotal?: number;
};

export const gameEvents = new Phaser.Events.EventEmitter();

export const emitStartRally = () => gameEvents.emit('command:start');
export const emitStroke = (stroke: StrokeType) => gameEvents.emit('command:stroke', stroke);
export const emitOpponent = (opponentId: OpponentId) =>
  gameEvents.emit('command:opponent', opponentId);
export const emitProfile = (profile: PlayerProfile) =>
  gameEvents.emit('command:profile', profile);

export const onSnapshot = (handler: (snapshot: GameSnapshot) => void) => {
  gameEvents.on('game:snapshot', handler);
  return () => {
    gameEvents.off('game:snapshot', handler);
  };
};

export const onFeedback = (handler: (feedback: TacticalFeedback) => void) => {
  gameEvents.on('game:feedback', handler);
  return () => {
    gameEvents.off('game:feedback', handler);
  };
};

export const onOpponentExplanation = (handler: (message: string) => void) => {
  gameEvents.on('game:opponent-explanation', handler);
  return () => {
    gameEvents.off('game:opponent-explanation', handler);
  };
};
