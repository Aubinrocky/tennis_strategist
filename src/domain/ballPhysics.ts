import type { Point, TrajectoryProfile } from './types';

export const TENNIS_BALL = {
  radius: 0.0335,
  gravity: 9.81,
  dragFactor: 0.018,
};

/**
 * Representative acrylic hard court in the middle of the ITF "medium" band.
 * CPR = 100 * (1 - COF) + 150 * (0.81 - COR) = 38.5.
 */
export const MEDIUM_HARD_COURT = {
  label: 'dur moyen',
  restitution: 0.82,
  friction: 0.6,
  paceRating: 38.5,
};

export type BallFlightModel = {
  durationMs: number;
  durationSeconds: number;
  startHeight: number;
  endHeight: number;
  verticalVelocity: number;
  effectiveGravity: number;
  distance: number;
  initialHorizontalSpeed: number;
  horizontalSpeed: number;
  impactVerticalSpeed: number;
  apexHeight: number;
  spinRpm: number;
};

export type BallBounceModel = {
  contactPoint: Point;
  contactHeight: number;
  durationMs: number;
  secondBouncePoint: Point;
  secondBounceDurationMs: number;
  postBounceHorizontalSpeed: number;
  speedAtContact: number;
  postBounceVerticalSpeed: number;
  effectiveGravity: number;
  horizontalRetention: number;
  apexHeight: number;
  distanceAfterBounce: number;
  secondBounceDistance: number;
  spinRpm: number;
};

type FlightOptions = {
  startHeight?: number;
  endHeight?: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const distanceBetween = (from: Point, to: Point) =>
  Math.hypot(to.x - from.x, to.y - from.y);

export function spinRpmFor(trajectory: TrajectoryProfile) {
  if (trajectory.spin === 'lifté') {
    return Math.round(1400 + trajectory.arc * 1700 + trajectory.pace * 350);
  }
  if (trajectory.spin === 'slice') {
    return -Math.round(600 + trajectory.arc * 900 + trajectory.pace * 300);
  }
  return Math.round(150 + trajectory.arc * 300);
}

export function modelBallFlight(
  from: Point,
  to: Point,
  trajectory: TrajectoryProfile,
  options: FlightOptions = {},
): BallFlightModel {
  const distance = Math.max(0.4, distanceBetween(from, to));
  const startHeight = options.startHeight ?? 1.04;
  const endHeight = options.endHeight ?? TENNIS_BALL.radius;
  const nominalSpeed = clamp(15 + trajectory.pace * 15, 18, 31);
  const arcTimeFactor = clamp(1 + (trajectory.arc - 0.45) * 0.34, 0.9, 1.18);
  const durationSeconds = clamp(distance / (nominalSpeed * 0.93) * arcTimeFactor, 0.52, 1.55);
  const gravityMultiplier =
    trajectory.spin === 'lifté'
      ? 1.16 + trajectory.arc * 0.13
      : trajectory.spin === 'slice'
        ? 0.86
        : 1.01;
  const effectiveGravity = TENNIS_BALL.gravity * gravityMultiplier;
  const verticalVelocity =
    (endHeight - startHeight + 0.5 * effectiveGravity * durationSeconds ** 2) /
    durationSeconds;
  const impactVerticalSpeed = Math.abs(verticalVelocity - effectiveGravity * durationSeconds);
  const initialHorizontalSpeed =
    (Math.exp(TENNIS_BALL.dragFactor * distance) - 1) /
    (TENNIS_BALL.dragFactor * durationSeconds);
  const horizontalSpeed =
    initialHorizontalSpeed /
    (1 + TENNIS_BALL.dragFactor * initialHorizontalSpeed * durationSeconds);
  const apexTime = clamp(verticalVelocity / effectiveGravity, 0, durationSeconds);
  const apexHeight =
    startHeight + verticalVelocity * apexTime - 0.5 * effectiveGravity * apexTime ** 2;

  return {
    durationMs: Math.round(durationSeconds * 1000),
    durationSeconds,
    startHeight,
    endHeight,
    verticalVelocity,
    effectiveGravity,
    distance,
    initialHorizontalSpeed,
    horizontalSpeed,
    impactVerticalSpeed,
    apexHeight,
    spinRpm: spinRpmFor(trajectory),
  };
}

export function sampleFlightGroundProgress(model: BallFlightModel, progress: number) {
  const t = clamp(progress, 0, 1) * model.durationSeconds;
  return clamp(
    distanceWithQuadraticDrag(model.initialHorizontalSpeed, t) / model.distance,
    0,
    1,
  );
}

export function sampleFlightHeight(model: BallFlightModel, progress: number) {
  const t = clamp(progress, 0, 1) * model.durationSeconds;
  return Math.max(
    TENNIS_BALL.radius,
    model.startHeight + model.verticalVelocity * t - 0.5 * model.effectiveGravity * t ** 2,
  );
}

export function modelHardCourtBounce(
  shotOrigin: Point,
  bouncePoint: Point,
  incoming: BallFlightModel,
  trajectory: TrajectoryProfile,
  playerHeightCm: number,
): BallBounceModel {
  const directionLength = Math.max(0.01, distanceBetween(shotOrigin, bouncePoint));
  const direction = {
    x: (bouncePoint.x - shotOrigin.x) / directionLength,
    y: (bouncePoint.y - shotOrigin.y) / directionLength,
  };
  const spinRpm = incoming.spinRpm;
  const angularSpeed = spinRpm * Math.PI * 2 / 60;
  const surfaceSpeed = angularSpeed * TENNIS_BALL.radius;
  const slipSpeed = Math.max(0, incoming.horizontalSpeed - surfaceSpeed);
  const coulombLoss =
    MEDIUM_HARD_COURT.friction *
    (1 + MEDIUM_HARD_COURT.restitution) *
    incoming.impactVerticalSpeed;
  // A tennis ball is close to a thin spherical shell: I ~= 2/3 mr².
  const rollingLoss = slipSpeed / (1 + 1 / (2 / 3));
  const horizontalLoss = Math.min(coulombLoss, rollingLoss);
  const postBounceHorizontalSpeed = Math.max(
    incoming.horizontalSpeed * 0.35,
    incoming.horizontalSpeed - horizontalLoss,
  );
  const verticalSpinFactor =
    trajectory.spin === 'lifté' ? 1.08 : trajectory.spin === 'slice' ? 0.88 : 0.98;
  const postBounceVerticalSpeed =
    incoming.impactVerticalSpeed * MEDIUM_HARD_COURT.restitution * verticalSpinFactor;
  const bounceGravity =
    TENNIS_BALL.gravity *
    (trajectory.spin === 'lifté' ? 1.06 : trajectory.spin === 'slice' ? 0.95 : 1);
  const apexTime = postBounceVerticalSpeed / bounceGravity;
  const apexHeight =
    TENNIS_BALL.radius + postBounceVerticalSpeed ** 2 / (2 * bounceGravity);
  const preferredHeight = clamp(
    playerHeightCm / 100 * 0.68 +
      (trajectory.spin === 'lifté' ? 0.35 : trajectory.spin === 'slice' ? -0.18 : 0.05),
    0.85,
    1.75,
  );
  const discriminant =
    postBounceVerticalSpeed ** 2 -
    2 * bounceGravity * (preferredHeight - TENNIS_BALL.radius);
  const naturalContactTime =
    discriminant >= 0
      ? (postBounceVerticalSpeed - Math.sqrt(discriminant)) / bounceGravity
      : apexTime * 0.92;
  const secondBounceTime = 2 * postBounceVerticalSpeed / bounceGravity;
  const contactTime = clamp(naturalContactTime, 0.28, secondBounceTime * 0.48);
  const distanceAfterBounce = distanceWithQuadraticDrag(postBounceHorizontalSpeed, contactTime);
  const secondBounceDistance = distanceWithQuadraticDrag(postBounceHorizontalSpeed, secondBounceTime);
  const contactPoint = {
    x: bouncePoint.x + direction.x * distanceAfterBounce,
    y: bouncePoint.y + direction.y * distanceAfterBounce,
  };
  const secondBouncePoint = {
    x: bouncePoint.x + direction.x * secondBounceDistance,
    y: bouncePoint.y + direction.y * secondBounceDistance,
  };
  const contactHeight = Math.max(
    TENNIS_BALL.radius,
    TENNIS_BALL.radius +
      postBounceVerticalSpeed * contactTime -
      0.5 * bounceGravity * contactTime ** 2,
  );

  return {
    contactPoint,
    contactHeight,
    durationMs: Math.round(contactTime * 1000),
    secondBouncePoint,
    secondBounceDurationMs: Math.round(secondBounceTime * 1000),
    postBounceHorizontalSpeed,
    speedAtContact:
      postBounceHorizontalSpeed /
      (1 + TENNIS_BALL.dragFactor * postBounceHorizontalSpeed * contactTime),
    postBounceVerticalSpeed,
    effectiveGravity: bounceGravity,
    horizontalRetention: postBounceHorizontalSpeed / incoming.horizontalSpeed,
    apexHeight,
    distanceAfterBounce,
    secondBounceDistance,
    spinRpm,
  };
}

export function sampleBounceHeight(model: BallBounceModel, progress: number) {
  const t = clamp(progress, 0, 1) * (model.secondBounceDurationMs / 1000);
  return Math.max(
    TENNIS_BALL.radius,
    TENNIS_BALL.radius + model.postBounceVerticalSpeed * t - 0.5 * model.effectiveGravity * t ** 2,
  );
}

export function sampleBounceGroundProgress(model: BallBounceModel, progress: number) {
  const t = clamp(progress, 0, 1) * (model.secondBounceDurationMs / 1000);
  return clamp(
    distanceWithQuadraticDrag(model.postBounceHorizontalSpeed, t) /
      model.secondBounceDistance,
    0,
    1,
  );
}

function distanceWithQuadraticDrag(initialSpeed: number, seconds: number) {
  return Math.log(1 + TENNIS_BALL.dragFactor * initialSpeed * seconds) / TENNIS_BALL.dragFactor;
}
