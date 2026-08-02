export type StrokeType = 'lifté' | 'à plat' | 'slice';
export type StrokeWing = 'coup droit' | 'revers';

export type Point = {
  x: number;
  y: number;
};

export type ContactQuality = 'en avance' | 'équilibré' | 'en retard' | 'en extension' | 'manqué';

export type TrajectoryProfile = {
  pace: number;
  arc: number;
  spin: StrokeType;
};

export type PlayerProfile = {
  name: string;
  dominantHand: 'Droitier' | 'Gaucher';
  age: number;
  height: number;
  forehand: number;
  backhand: number;
  serve: number;
  endurance: number;
  agility: number;
};

export type OpponentId = 'regular' | 'runner' | 'attacker';

export type Opponent = {
  id: OpponentId;
  name: string;
  label: string;
  description: string;
  accent: string;
  consistency: number;
  aggression: number;
  speed: number;
};

export type TacticalFeedback = {
  verdict: 'excellent' | 'solide' | 'risqué' | 'faute';
  score: number;
  shotLabel: string;
  title: string;
  explanation: string;
  alternative: string;
  factors: Array<{ label: string; value: number }>;
  contactQuality?: ContactQuality;
  intendedTarget?: Point;
  actualTarget?: Point;
  outcome?: 'in' | 'out' | 'net' | 'miss';
  pressure?: number;
  wing?: StrokeWing;
};

export const DEFAULT_PROFILE: PlayerProfile = {
  name: 'Mon joueur',
  dominantHand: 'Droitier',
  age: 30,
  height: 180,
  forehand: 3,
  backhand: 3,
  serve: 3,
  endurance: 4,
  agility: 4,
};

export const OPPONENTS: Opponent[] = [
  {
    id: 'regular',
    name: 'Alex',
    label: 'Le régulier',
    description: 'Profond, patient, peu de fautes.',
    accent: '#b8f566',
    consistency: 82,
    aggression: 42,
    speed: 62,
  },
  {
    id: 'runner',
    name: 'Sam',
    label: 'Le défenseur',
    description: 'Couvre le terrain et remet une balle de plus.',
    accent: '#68d9ff',
    consistency: 74,
    aggression: 30,
    speed: 86,
  },
  {
    id: 'attacker',
    name: 'Charlie',
    label: "L'attaquant",
    description: 'Prend tôt, accélère et accepte le risque.',
    accent: '#ff9d66',
    consistency: 58,
    aggression: 88,
    speed: 70,
  },
];
