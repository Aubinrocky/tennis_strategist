import { describe, expect, it } from 'vitest';
import {
  MEDIUM_HARD_COURT,
  TENNIS_BALL,
  modelBallFlight,
  modelHardCourtBounce,
  sampleBounceHeight,
  sampleFlightHeight,
} from './ballPhysics';
import type { TrajectoryProfile } from './types';

const origin = { x: 0, y: -13.2 };
const landing = { x: 2.8, y: 9 };

const trajectories: Record<'flat' | 'topspin' | 'slice', TrajectoryProfile> = {
  flat: { spin: 'à plat', pace: 0.8, arc: 0.28 },
  topspin: { spin: 'lifté', pace: 0.62, arc: 0.68 },
  slice: { spin: 'slice', pace: 0.62, arc: 0.36 },
};

describe('ball physics', () => {
  it('uses an ITF medium court calibration', () => {
    expect(MEDIUM_HARD_COURT.restitution).toBeGreaterThanOrEqual(0.79);
    expect(MEDIUM_HARD_COURT.restitution).toBeLessThanOrEqual(0.84);
    expect(MEDIUM_HARD_COURT.friction).toBeGreaterThanOrEqual(0.56);
    expect(MEDIUM_HARD_COURT.friction).toBeLessThanOrEqual(0.7);
    expect(MEDIUM_HARD_COURT.paceRating).toBeGreaterThanOrEqual(35);
    expect(MEDIUM_HARD_COURT.paceRating).toBeLessThanOrEqual(39);
  });

  it('lands a ballistic flight at ball radius without dipping below the court', () => {
    const flight = modelBallFlight(origin, landing, trajectories.topspin);
    const samples = Array.from({ length: 21 }, (_, index) =>
      sampleFlightHeight(flight, index / 20),
    );

    expect(samples[0]).toBeCloseTo(1.04, 2);
    expect(samples.at(-1)).toBeCloseTo(TENNIS_BALL.radius, 2);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(TENNIS_BALL.radius);
    expect(flight.durationSeconds).toBeGreaterThan(0.7);
    expect(flight.durationSeconds).toBeLessThan(1.4);
  });

  it('carries a realistic deep ball several metres beyond its first bounce', () => {
    const flight = modelBallFlight(origin, landing, trajectories.slice);
    const bounce = modelHardCourtBounce(origin, landing, flight, trajectories.slice, 180);

    expect(bounce.distanceAfterBounce).toBeGreaterThan(4.5);
    expect(bounce.contactPoint.y).toBeGreaterThan(13.5);
    expect(bounce.secondBounceDistance).toBeGreaterThan(bounce.distanceAfterBounce);
  });

  it('loses horizontal speed at impact while preserving meaningful pace', () => {
    const flight = modelBallFlight(origin, landing, trajectories.flat);
    const bounce = modelHardCourtBounce(origin, landing, flight, trajectories.flat, 180);

    expect(bounce.postBounceHorizontalSpeed).toBeLessThan(flight.horizontalSpeed);
    expect(bounce.horizontalRetention).toBeGreaterThan(0.5);
    expect(bounce.horizontalRetention).toBeLessThan(0.9);
  });

  it('makes topspin kick higher than slice', () => {
    const topspinFlight = modelBallFlight(origin, landing, trajectories.topspin);
    const sliceFlight = modelBallFlight(origin, landing, trajectories.slice);
    const topspinBounce = modelHardCourtBounce(
      origin,
      landing,
      topspinFlight,
      trajectories.topspin,
      180,
    );
    const sliceBounce = modelHardCourtBounce(
      origin,
      landing,
      sliceFlight,
      trajectories.slice,
      180,
    );

    expect(topspinBounce.apexHeight).toBeGreaterThan(sliceBounce.apexHeight);
    expect(topspinBounce.spinRpm).toBeGreaterThan(0);
    expect(sliceBounce.spinRpm).toBeLessThan(0);
  });

  it('keeps the post-bounce animation above the surface and at contact height', () => {
    const flight = modelBallFlight(origin, landing, trajectories.flat);
    const bounce = modelHardCourtBounce(origin, landing, flight, trajectories.flat, 180);
    const samples = Array.from({ length: 21 }, (_, index) =>
      sampleBounceHeight(bounce, index / 20),
    );

    expect(Math.min(...samples)).toBeGreaterThanOrEqual(TENNIS_BALL.radius);
    expect(samples.at(-1)).toBeCloseTo(bounce.contactHeight, 2);
  });
});
