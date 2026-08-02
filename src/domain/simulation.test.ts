import { describe, expect, it } from 'vitest';
import {
  analyseContact,
  chooseOpponentShot,
  chooseOpponentTarget,
  evaluateShot,
  isTargetInCourt,
  resolvePlayerShot,
} from './simulation';
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

  it('reduces precision when the player reaches the ball late and stretched', () => {
    const balanced = analyseContact(0.4, 0, DEFAULT_PROFILE);
    const stretched = analyseContact(1.9, 380, DEFAULT_PROFILE);

    expect(balanced.quality).toBe('équilibré');
    expect(stretched.quality).toBe('en extension');
    expect(balanced.precision).toBeGreaterThan(stretched.precision);
  });

  it('turns an ambitious line target into a possible real error', () => {
    const stretched = analyseContact(1.9, 380, DEFAULT_PROFILE);
    const shot = resolvePlayerShot(
      { x: 3.9, y: -10.8 },
      { x: 2.8, y: 9 },
      { x: 0, y: -9 },
      'lifté',
      0.9,
      DEFAULT_PROFILE,
      stretched,
      0.98,
      0.98,
    );

    expect(shot.feedback.outcome).toBe('out');
    expect(shot.actualTarget).not.toEqual(shot.feedback.intendedTarget);
  });

  it('makes the opponent return higher and slower under pressure', () => {
    const neutral = chooseOpponentShot(OPPONENTS[0], { x: 0, y: 9 }, 0, [0.5, 0.5, 0.5]);
    const defensive = chooseOpponentShot(OPPONENTS[0], { x: 0, y: 9 }, 90, [0.5, 0.5, 0.5]);

    expect(defensive.trajectory.arc).toBeGreaterThan(neutral.trajectory.arc);
    expect(defensive.trajectory.pace).toBeLessThan(neutral.trajectory.pace);
  });
});
