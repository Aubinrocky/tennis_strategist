import { describe, expect, it } from 'vitest';
import { chooseOpponentTarget, evaluateShot, isTargetInCourt } from './simulation';
import { DEFAULT_PROFILE, OPPONENTS } from './types';

describe('tactical simulation', () => {
  it('rejects targets outside the singles court', () => {
    expect(isTargetInCourt({ x: 5, y: -8 })).toBe(false);
    expect(isTargetInCourt({ x: 3, y: -8 })).toBe(true);
  });

  it('rewards a deep target that moves the opponent', () => {
    const deepWide = evaluateShot(
      { x: -3.4, y: -10 },
      { x: 0, y: 9 },
      { x: 2, y: -8.5 },
      'lifté',
      0.62,
      DEFAULT_PROFILE,
    );
    const shortMiddle = evaluateShot(
      { x: 0, y: -4 },
      { x: 0, y: 9 },
      { x: 0, y: -8.5 },
      'à plat',
      0.62,
      DEFAULT_PROFILE,
    );

    expect(deepWide.score).toBeGreaterThan(shortMiddle.score);
  });

  it('makes the opponent play away from the player', () => {
    const target = chooseOpponentTarget(OPPONENTS[0], { x: 2, y: 8 }, 0.5);
    expect(target.x).toBeLessThan(0);
    expect(target.y).toBeGreaterThan(0);
  });
});

