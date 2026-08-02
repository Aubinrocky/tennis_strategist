import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { gameConfig } from './TennisScene';

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const game = new Phaser.Game(gameConfig(hostRef.current));
    return () => game.destroy(true);
  }, []);

  return <div className="game-canvas" ref={hostRef} aria-label="Court de tennis interactif" />;
}

