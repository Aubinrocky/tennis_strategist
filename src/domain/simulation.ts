import type {
  ContactQuality,
  Opponent,
  PlayerProfile,
  Point,
  StrokeType,
  StrokeWing,
  TacticalFeedback,
  TrajectoryProfile,
} from './types';

export const COURT = {
  halfWidth: 4.115,
  halfLength: 11.885,
  // 6.4 m behind each baseline, matching a full-size tournament run-back.
  runOff: 18.285,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export type ContactAnalysis = {
  quality: ContactQuality;
  reach: number;
  timing: number;
  precision: number;
  label: string;
};

export type ShotResolution = {
  feedback: TacticalFeedback;
  actualTarget: Point;
  trajectory: TrajectoryProfile;
};

export type OpponentShot = {
  target: Point;
  actualTarget: Point;
  trajectory: TrajectoryProfile;
  duration: number;
  isFault: boolean;
  explanation: string;
};

export function isTargetInCourt(target: Point, opponentSide = true) {
  const correctHalf = opponentSide ? target.y < 0 : target.y > 0;
  return (
    correctHalf &&
    Math.abs(target.x) <= COURT.halfWidth &&
    Math.abs(target.y) <= COURT.halfLength
  );
}

export function determineStrokeWing(
  playerX: number,
  ballX: number,
  dominantHand: PlayerProfile['dominantHand'],
): StrokeWing {
  const ballOnRight = ballX - playerX >= 0;
  const isForehand = dominantHand === 'Droitier' ? ballOnRight : !ballOnRight;
  return isForehand ? 'coup droit' : 'revers';
}

export function analyseContact(
  distanceToBall: number,
  arrivalOffsetMs: number,
  profile: PlayerProfile,
): ContactAnalysis {
  const reachAllowance = 0.62 + profile.agility * 0.055;
  const reach = clamp(1 - Math.max(0, distanceToBall - reachAllowance) / 2.25, 0, 1);
  const absoluteTiming = Math.abs(arrivalOffsetMs);
  const timing = clamp(1 - absoluteTiming / 1800, 0, 1);

  let quality: ContactQuality;
  if (distanceToBall > 2.65 || arrivalOffsetMs > 2500) quality = 'manqué';
  else if (distanceToBall > 1.55 || arrivalOffsetMs > 1750) quality = 'en extension';
  else if (arrivalOffsetMs > 650 || distanceToBall > 1.05) quality = 'en retard';
  else if (arrivalOffsetMs < -170) quality = 'en avance';
  else quality = 'équilibré';

  const skill = ((profile.forehand + profile.backhand) / 2 - 1) / 4;
  const precision = clamp(0.34 + reach * 0.32 + timing * 0.18 + skill * 0.16, 0.08, 0.98);
  const label =
    quality === 'équilibré'
      ? 'Bien placé · frappe équilibrée'
      : quality === 'en avance'
        ? 'En avance · toutes les options restent ouvertes'
        : quality === 'en retard'
          ? 'En retard · précision réduite'
          : quality === 'en extension'
            ? 'En extension · remise défensive'
            : 'Balle hors de portée';

  return { quality, reach, timing, precision, label };
}

export function resolvePlayerShot(
  intendedTarget: Point,
  playerPosition: Point,
  opponentPosition: Point,
  stroke: StrokeType,
  power: number,
  profile: PlayerProfile,
  contact: ContactAnalysis,
  lateralRoll: number,
  depthRoll: number,
  wing: StrokeWing = 'coup droit',
): ShotResolution {
  const skill = ((wing === 'coup droit' ? profile.forehand : profile.backhand) - 1) / 4;
  const strokeControl = stroke === 'lifté' ? 0.18 : stroke === 'slice' ? 0.08 : -0.06;
  const powerPenalty = clamp((power - 0.62) * 0.62, 0, 0.28);
  const dispersion = clamp(1.62 - contact.precision * 1.1 - skill * 0.25 - strokeControl + powerPenalty, 0.18, 1.75);
  const lateBias = contact.quality === 'en retard' || contact.quality === 'en extension' ? playerPosition.x * 0.12 : 0;
  const actualTarget = {
    x: intendedTarget.x + (lateralRoll - 0.5) * 2 * dispersion + lateBias,
    y: intendedTarget.y + (depthRoll - 0.5) * 2 * dispersion * 1.55 + powerPenalty * -2.1,
  };

  const trajectory: TrajectoryProfile = {
    pace: clamp(0.42 + power * 0.5 + (stroke === 'à plat' ? 0.12 : 0) - (1 - contact.reach) * 0.2, 0.3, 1),
    arc: clamp(
      stroke === 'lifté' ? 0.72 - power * 0.2 : stroke === 'slice' ? 0.34 : 0.44 - power * 0.18,
      0.14,
      0.82,
    ),
    spin: stroke,
  };

  return {
    actualTarget,
    trajectory,
    feedback: evaluateResolvedShot(
      intendedTarget,
      actualTarget,
      playerPosition,
      opponentPosition,
      stroke,
      power,
      profile,
      contact,
      trajectory,
      wing,
    ),
  };
}

function evaluateResolvedShot(
  intendedTarget: Point,
  actualTarget: Point,
  playerPosition: Point,
  opponentPosition: Point,
  stroke: StrokeType,
  power: number,
  profile: PlayerProfile,
  contact: ContactAnalysis,
  trajectory: TrajectoryProfile,
  wing: StrokeWing,
): TacticalFeedback {
  const isSameLane =
    Math.sign(intendedTarget.x) === Math.sign(playerPosition.x) && Math.abs(playerPosition.x) > 0.8;
  const direction =
    Math.abs(intendedTarget.x) < 0.9 ? 'au centre' : isSameLane ? 'long de ligne' : 'croisé';
  const targetDepth = clamp((-intendedTarget.y - 3.5) / 8.2, 0, 1);
  const length = targetDepth > 0.68 ? 'profond' : targetDepth < 0.24 ? 'court' : 'mi-long';
  const shotLabel = `${wing === 'coup droit' ? 'Coup droit' : 'Revers'} ${stroke} ${direction}, ${length}`;

  if (contact.quality === 'manqué') {
    return faultFeedback(
      shotLabel,
      contact,
      intendedTarget,
      actualTarget,
      'miss',
      'Balle hors de portée',
      "Tu n’as pas rejoint la zone de frappe avant le deuxième rebond. Le problème vient d’abord du replacement, pas du choix de cible.",
      'Reviens vers le centre de récupération dès ta frappe précédente.',
      wing,
    );
  }

  const netClearance = trajectory.arc + (stroke === 'lifté' ? 0.18 : 0) - power * 0.18 - (1 - contact.reach) * 0.2;
  if (netClearance < 0.08) {
    return faultFeedback(
      shotLabel,
      contact,
      intendedTarget,
      actualTarget,
      'net',
      'Balle dans le filet',
      `La trajectoire ${stroke === 'à plat' ? 'très tendue' : 'trop basse'} ne laisse pas assez de marge depuis une frappe ${contact.quality}.`,
      'Ajoute du lift ou réduis la puissance pour retrouver de la hauteur au-dessus du filet.',
      wing,
    );
  }

  if (!isTargetInCourt(actualTarget)) {
    const lineMargin = Math.min(COURT.halfWidth - Math.abs(intendedTarget.x), COURT.halfLength - Math.abs(intendedTarget.y));
    return faultFeedback(
      shotLabel,
      contact,
      intendedTarget,
      actualTarget,
      'out',
      'Cible ambitieuse, balle dehors',
      `Tu visais à ${Math.max(0, lineMargin).toFixed(1)} m de la ligne avec une frappe ${contact.quality}. La dispersion réelle a déplacé la balle hors du court.`,
      'Quand tu es en retard, vise deux mètres à l’intérieur des lignes et utilise la diagonale.',
      wing,
    );
  }

  const depth = clamp((-actualTarget.y - 3.5) / 8.2, 0, 1);
  const displacement = clamp(Math.abs(actualTarget.x - opponentPosition.x) / 7.2, 0, 1);
  const lineMargin = clamp(
    Math.min(COURT.halfWidth - Math.abs(actualTarget.x), COURT.halfLength - Math.abs(actualTarget.y)) / 2.1,
    0,
    1,
  );
  const powerRisk = clamp((power - 0.68) * 0.75, 0, 0.28);
  const safety = clamp(contact.precision * 0.62 + lineMargin * 0.22 + (stroke === 'lifté' ? 0.12 : 0.04) - powerRisk, 0, 1);
  const recoveryCost = clamp(Math.abs(playerPosition.x) / COURT.halfWidth, 0, 1);
  const total = Math.round(
    100 * (safety * 0.38 + depth * 0.22 + displacement * 0.25 + (1 - recoveryCost) * 0.07 + contact.reach * 0.08),
  );
  const pressure = Math.round(clamp(depth * 0.36 + displacement * 0.34 + trajectory.pace * 0.2 + (1 - safety) * 0.1, 0, 1) * 100);
  const verdict = total >= 78 ? 'excellent' : total >= 60 ? 'solide' : 'risqué';
  const title = verdict === 'excellent' ? 'Très bon choix tactique' : verdict === 'solide' ? 'Choix solide' : 'Option ambitieuse';
  const contactSentence =
    contact.quality === 'équilibré'
      ? 'Ton placement donne une zone de frappe stable.'
      : `Le contact ${contact.quality} élargit ta dispersion et réduit les angles sûrs.`;
  const mainReason =
    displacement > 0.65
      ? 'Tu éloignes l’adversaire de sa zone de confort.'
      : depth > 0.7
        ? 'La profondeur lui laisse peu de temps pour organiser sa réponse.'
        : 'La balle reste jouable mais crée encore peu de déséquilibre.';

  return {
    verdict,
    score: total,
    shotLabel,
    title,
    explanation: `${contactSentence} ${mainReason} La balle réelle termine à ${Math.abs(actualTarget.x - intendedTarget.x).toFixed(1)} m de ta cible latérale.`,
    alternative:
      contact.quality === 'en retard' || contact.quality === 'en extension'
        ? 'Choisis une diagonale haute et profonde : le filet est plus bas au centre et la diagonale est plus longue.'
        : displacement < 0.55
          ? 'Cherche davantage la diagonale pour ouvrir le court sans viser la ligne.'
          : 'Joue profond au centre si tu veux réduire le risque et te replacer.',
    factors: [
      { label: 'Contact', value: Math.round(contact.precision * 100) },
      { label: 'Marge', value: Math.round(lineMargin * 100) },
      { label: 'Pression', value: pressure },
    ],
    contactQuality: contact.quality,
    intendedTarget,
    actualTarget,
    outcome: 'in',
    pressure,
    wing,
  };
}

function faultFeedback(
  shotLabel: string,
  contact: ContactAnalysis,
  intendedTarget: Point,
  actualTarget: Point,
  outcome: 'out' | 'net' | 'miss',
  title: string,
  explanation: string,
  alternative: string,
  wing: StrokeWing,
): TacticalFeedback {
  return {
    verdict: 'faute',
    score: 0,
    shotLabel,
    title,
    explanation,
    alternative,
    factors: [
      { label: 'Contact', value: Math.round(contact.precision * 100) },
      { label: 'Marge', value: 0 },
      { label: 'Pression', value: 0 },
    ],
    contactQuality: contact.quality,
    intendedTarget,
    actualTarget,
    outcome,
    pressure: 0,
    wing,
  };
}

export function evaluateShot(
  target: Point,
  playerPosition: Point,
  opponentPosition: Point,
  stroke: StrokeType,
  power: number,
  profile: PlayerProfile,
): TacticalFeedback {
  const contact = analyseContact(0.45, 0, profile);
  return resolvePlayerShot(target, playerPosition, opponentPosition, stroke, power, profile, contact, 0.5, 0.5).feedback;
}

export function chooseOpponentShot(
  opponent: Opponent,
  playerPosition: Point,
  previousPressure: number,
  rolls: [number, number, number],
): OpponentShot {
  const [targetRoll, errorRoll, faultRoll] = rolls;
  const openSide = playerPosition.x >= 0 ? -1 : 1;
  const pressure = clamp(previousPressure / 100, 0, 1);
  const attackBias = opponent.aggression / 100;
  const defensive = pressure > 0.62;
  const width = defensive ? openSide * 1.25 : openSide * (2.15 + attackBias * 1.25);
  const depth = defensive ? 7.2 : 8 + attackBias * 1.7;
  const jitterScale = (100 - opponent.consistency) / 100;
  const target = {
    x: clamp(width + (targetRoll - 0.5) * 1.2, -3.75, 3.75),
    y: clamp(depth + (targetRoll - 0.5) * 1.1, 6.2, 10.7),
  };
  const error = 0.25 + jitterScale * 1.45 + pressure * 0.85;
  const actualTarget = {
    x: target.x + (errorRoll - 0.5) * error * 1.35,
    y: target.y + (faultRoll - 0.5) * error * 1.65,
  };
  const forcedFaultChance = clamp(0.008 + jitterScale * 0.045 + pressure * 0.11, 0, 0.2);
  const isFault = faultRoll < forcedFaultChance || !isTargetInCourt(actualTarget, false);
  if (isFault && faultRoll < forcedFaultChance) actualTarget.y = COURT.halfLength + 0.5 + error;

  const spin: StrokeType = defensive ? 'lifté' : opponent.id === 'attacker' ? 'à plat' : opponent.id === 'runner' ? 'lifté' : 'slice';
  const pace = clamp(0.48 + attackBias * 0.38 - pressure * 0.24, 0.34, 0.92);
  const arc = clamp(defensive ? 0.82 : spin === 'à plat' ? 0.28 : spin === 'slice' ? 0.36 : 0.66, 0.2, 0.88);
  const duration = Math.round(1120 - pace * 420 + arc * 130);
  const explanation = isFault
    ? `${opponent.name} est sous ${Math.round(pressure * 100)} % de pression et manque sa longueur : le point est terminé.`
    : defensive
      ? `${opponent.name} est en retard sur ta balle. Il renvoie haut, plus lent et plus au centre pour gagner du temps.`
      : explainOpponentChoice(opponent, actualTarget);

  return { target, actualTarget, trajectory: { pace, arc, spin }, duration, isFault, explanation };
}

export function chooseOpponentTarget(opponent: Opponent, playerPosition: Point, roll: number): Point {
  return chooseOpponentShot(opponent, playerPosition, 0, [roll, 0.5, 0.5]).actualTarget;
}

export function explainOpponentChoice(opponent: Opponent, target: Point) {
  const direction = target.x < 0 ? 'ton côté gauche' : 'ton côté droit';
  if (opponent.id === 'attacker') {
    return `${opponent.name} vise ${direction} avec une trajectoire tendue pour prendre du temps. Son profil accepte davantage de risque.`;
  }
  if (opponent.id === 'runner') {
    return `${opponent.name} joue lifté, haut et profond vers ${direction}. Il cherche à te repousser avant de récupérer le centre.`;
  }
  return `${opponent.name} choisit une balle profonde en slice vers ${direction} : elle ralentit après le rebond et t’écarte de ta zone de récupération.`;
}
