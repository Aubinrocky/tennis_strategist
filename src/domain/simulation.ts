import type { Opponent, PlayerProfile, Point, StrokeType, TacticalFeedback } from './types';

export const COURT = {
  halfWidth: 4.115,
  halfLength: 11.885,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function isTargetInCourt(target: Point, opponentSide = true) {
  const correctHalf = opponentSide ? target.y < 0 : target.y > 0;
  return (
    correctHalf &&
    Math.abs(target.x) <= COURT.halfWidth &&
    Math.abs(target.y) <= COURT.halfLength
  );
}

export function evaluateShot(
  target: Point,
  playerPosition: Point,
  opponentPosition: Point,
  stroke: StrokeType,
  power: number,
  profile: PlayerProfile,
): TacticalFeedback {
  if (!isTargetInCourt(target)) {
    return {
      verdict: 'faute',
      score: 0,
      title: 'Cible hors du court',
      explanation:
        'La direction cherchée sort du terrain. Garde une marge intérieure, surtout quand tu frappes en mouvement.',
      alternative: 'Vise un mètre à l’intérieur de la ligne et construis le point.',
      factors: [
        { label: 'Sécurité', value: 0 },
        { label: 'Déplacement', value: 0 },
        { label: 'Profondeur', value: 0 },
      ],
    };
  }

  const depth = clamp((-target.y - 3.5) / 8.2, 0, 1);
  const displacement = clamp(Math.abs(target.x - opponentPosition.x) / 7.2, 0, 1);
  const distance = Math.hypot(target.x - playerPosition.x, target.y - playerPosition.y);
  const ability = ((profile.forehand + profile.backhand) / 2 - 1) / 4;
  const spinSafety = stroke === 'lifté' ? 0.14 : stroke === 'slice' ? 0.06 : -0.04;
  const powerRisk = clamp((power - 0.68) * 0.75, 0, 0.28);
  const distanceRisk = clamp((distance - 18) / 15, 0, 0.25);
  const safety = clamp(0.72 + ability * 0.16 + spinSafety - powerRisk - distanceRisk, 0, 1);
  const recoveryCost = clamp(Math.abs(playerPosition.x) / COURT.halfWidth, 0, 1);
  const total = Math.round(
    100 * (safety * 0.42 + depth * 0.25 + displacement * 0.25 + (1 - recoveryCost) * 0.08),
  );

  const verdict = total >= 78 ? 'excellent' : total >= 62 ? 'solide' : 'risqué';
  const title =
    verdict === 'excellent'
      ? 'Très bon choix tactique'
      : verdict === 'solide'
        ? 'Choix solide'
        : 'Option ambitieuse';

  const mainReason =
    displacement > 0.65
      ? "Tu éloignes l’adversaire de sa zone de confort."
      : depth > 0.7
        ? 'La profondeur lui laisse peu de temps pour organiser son attaque.'
        : 'La cible conserve une marge correcte, mais ne crée pas encore beaucoup de déséquilibre.';

  const riskReason =
    powerRisk > 0.12
      ? ' La puissance augmente nettement le risque de faute.'
      : stroke === 'lifté'
        ? ' Le lift apporte de la sécurité au-dessus du filet.'
        : '';

  return {
    verdict,
    score: total,
    title,
    explanation: `${mainReason}${riskReason}`,
    alternative:
      displacement < 0.55
        ? 'Alternative : cherche davantage la diagonale pour ouvrir le court.'
        : 'Alternative : joue profond au centre si tu veux réduire le risque et te replacer.',
    factors: [
      { label: 'Sécurité', value: Math.round(safety * 100) },
      { label: 'Déplacement', value: Math.round(displacement * 100) },
      { label: 'Profondeur', value: Math.round(depth * 100) },
    ],
  };
}

export function chooseOpponentTarget(
  opponent: Opponent,
  playerPosition: Point,
  roll: number,
): Point {
  const openSide = playerPosition.x >= 0 ? -1 : 1;
  const attackBias = opponent.aggression / 100;
  const width = openSide * (2.2 + attackBias * 1.35);
  const jitter = (roll - 0.5) * (opponent.consistency > 70 ? 0.6 : 1.4);

  return {
    x: clamp(width + jitter, -3.75, 3.75),
    y: clamp(8.1 + opponent.aggression * 0.018 + jitter, 6.5, 10.6),
  };
}

export function explainOpponentChoice(opponent: Opponent, target: Point) {
  const direction = target.x < 0 ? 'ton côté gauche' : 'ton côté droit';
  if (opponent.id === 'attacker') {
    return `${opponent.name} vise ${direction} pour prendre l’initiative tôt. Son profil accepte davantage de risque pour raccourcir l’échange.`;
  }
  if (opponent.id === 'runner') {
    return `${opponent.name} joue haut et profond vers ${direction}. Il cherche surtout à te repousser avant de récupérer le centre.`;
  }
  return `${opponent.name} choisit une balle profonde vers ${direction} : une option avec de la marge qui t’empêche d’attaquer facilement.`;
}

