import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { OpponentId, PlayerProfile, StrokeType } from '../domain/types';
import { emitOpponent, emitProfile, emitStartRally, emitStroke } from './events';
import { gameConfig } from './TennisScene';

type GameCanvasProps = {
  profile: PlayerProfile;
  opponentId: OpponentId;
  stroke: StrokeType;
};

export function GameCanvas({ profile, opponentId, stroke }: GameCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const launchSession = () => {
      emitProfile(profile);
      emitOpponent(opponentId);
      emitStroke(stroke);
      emitStartRally();
    };
    const game = new Phaser.Game(gameConfig(hostRef.current));
    const launchTimer = window.setTimeout(launchSession, 300);
    return () => {
      window.clearTimeout(launchTimer);
      game.destroy(true);
    };
  }, []);

  return <div className="game-canvas" ref={hostRef} aria-label="Court de tennis interactif" />;
}
