import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DEFAULT_PROFILE,
  OPPONENTS,
  type PlayerProfile,
  type StrokeType,
  type TacticalFeedback,
} from './domain/types';
import {
  emitStroke,
  onFeedback,
  onSnapshot,
  type GameSnapshot,
} from './game/events';
import { GameCanvas } from './game/GameCanvas';
import { loadProfile, saveProfile } from './storage/profile';

const INITIAL_SNAPSHOT: GameSnapshot = {
  phase: 'idle',
  instruction: 'Préparation de la simulation…',
  rally: 0,
};

const PHASE_LABELS: Record<GameSnapshot['phase'], string> = {
  idle: 'Préparation',
  opponent: 'Frappe adverse',
  decision: 'À toi de jouer',
  player: 'Ta trajectoire',
  feedback: 'Analyse',
};

function App() {
  const [screen, setScreen] = useState<'lobby' | 'match'>('lobby');
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [feedback, setFeedback] = useState<TacticalFeedback | null>(null);
  const [opponentId, setOpponentId] = useState(OPPONENTS[0].id);
  const [stroke, setStroke] = useState<StrokeType>('lifté');
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [draftProfile, setDraftProfile] = useState<PlayerProfile>(profile);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const opponent = useMemo(
    () => OPPONENTS.find((item) => item.id === opponentId) ?? OPPONENTS[0],
    [opponentId],
  );

  useEffect(() => {
    const cleanSnapshot = onSnapshot((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      if (nextSnapshot.phase === 'opponent') setFeedback(null);
    });
    const cleanFeedback = onFeedback(setFeedback);
    return () => {
      cleanSnapshot();
      cleanFeedback();
    };
  }, []);

  const selectStroke = (value: StrokeType) => {
    setStroke(value);
    emitStroke(value);
  };

  const updateDraft = <K extends keyof PlayerProfile>(key: K, value: PlayerProfile[K]) => {
    setDraftProfile((current) => ({ ...current, [key]: value }));
  };

  const persistProfile = () => {
    setProfile(draftProfile);
    saveProfile(draftProfile);
    setSettingsOpen(false);
  };

  const launchMatch = () => {
    setFeedback(null);
    setSnapshot(INITIAL_SNAPSHOT);
    setScreen('match');
  };

  const leaveMatch = () => {
    setFeedback(null);
    setSnapshot(INITIAL_SNAPSHOT);
    setScreen('lobby');
  };

  if (screen === 'match') {
    return (
      <main className="match-shell">
        <GameCanvas profile={profile} opponentId={opponentId} stroke={stroke} />

        <header className="match-hud match-hud--top">
          <button className="match-back" onClick={leaveMatch} aria-label="Quitter la simulation">
            <span aria-hidden="true">←</span>
            <span>Quitter</span>
          </button>
          <div className="match-opponent">
            <span className="opponent-avatar" style={{ '--opponent-accent': opponent.accent } as CSSProperties}>
              {opponent.name.slice(0, 1)}
            </span>
            <span><small>ADVERSAIRE</small><strong>{opponent.name} · {opponent.label}</strong></span>
          </div>
          <div className={`match-phase match-phase--${snapshot.phase}`}>
            <i /> {PHASE_LABELS[snapshot.phase]}
          </div>
        </header>

        <div className="match-instruction">
          <span>ÉCHANGE {String(snapshot.rally).padStart(2, '0')}</span>
          <p>{snapshot.instruction}</p>
        </div>

        <div className="match-controls" aria-label="Type de frappe">
          <span>FRAPPE</span>
          {(['lifté', 'à plat', 'slice'] as StrokeType[]).map((item) => (
            <button key={item} className={stroke === item ? 'is-active' : ''} onClick={() => selectStroke(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="match-help">
          <span><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> bouger</span>
          <span><i className="mouse-icon" /> maintenir · viser · relâcher</span>
        </div>

        {feedback && snapshot.phase === 'feedback' && (
          <aside className={`match-feedback match-feedback--${feedback.verdict}`}>
            <div className="match-feedback__score">{feedback.score}</div>
            <div>
              <span>{feedback.verdict}</span>
              <h2>{feedback.title}</h2>
              <p>{feedback.explanation}</p>
            </div>
          </aside>
        )}
      </main>
    );
  }

  return (
    <main className="lobby-shell">
      <header className="topbar lobby-topbar">
        <a className="brand" href="#top" aria-label="Accueil Tennis Strategy Lab">
          <span className="brand-mark">TS</span>
          <span><strong>Tennis Strategy</strong><small>Decision lab</small></span>
        </a>
        <button className="profile-button" onClick={() => setSettingsOpen(true)}>
          <span className="avatar">{profile.name.slice(0, 1).toUpperCase()}</span>
          <span>{profile.name}</span>
          <span aria-hidden="true">⚙</span>
        </button>
      </header>

      <section className="lobby-hero" id="top">
        <p className="eyebrow">ÉTAPE 01 · PRÉPARER LA SIMULATION</p>
        <h1>Choisis ton adversaire.</h1>
        <p>Chaque profil pose un problème tactique différent. Sélectionne celui que tu veux travailler, puis entre sur le court.</p>
      </section>

      <section className="lobby-opponents" aria-label="Choix de l’adversaire">
        {OPPONENTS.map((item, index) => (
          <button
            key={item.id}
            className={`lobby-opponent ${item.id === opponentId ? 'is-active' : ''}`}
            onClick={() => setOpponentId(item.id)}
            style={{ '--opponent-accent': item.accent } as CSSProperties}
          >
            <span className="lobby-opponent__number">0{index + 1}</span>
            <span className="lobby-opponent__avatar">{item.name.slice(0, 1)}</span>
            <span className="lobby-opponent__identity">
              <small>{item.label}</small>
              <strong>{item.name}</strong>
              <p>{item.description}</p>
            </span>
            <span className="lobby-opponent__stats">
              <Metric label="Régularité" value={item.consistency} />
              <Metric label="Agressivité" value={item.aggression} />
              <Metric label="Vitesse" value={item.speed} />
            </span>
            <span className="selection-mark">{item.id === opponentId ? 'Sélectionné' : 'Choisir'}</span>
          </button>
        ))}
      </section>

      <footer className="lobby-launch">
        <div>
          <span className="selected-dot" style={{ background: opponent.accent }} />
          <p><small>TON ADVERSAIRE</small><strong>{opponent.name} · {opponent.label}</strong></p>
        </div>
        <button className="launch-button" onClick={launchMatch}>
          <span>Lancer la simulation</span>
          <span aria-hidden="true">→</span>
        </button>
      </footer>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><p className="eyebrow">CALIBRATION</p><h2 id="profile-title">Ton profil de jeu</h2></div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Fermer">×</button>
            </div>
            <div className="profile-grid">
              <label className="field"><span>Nom du joueur</span><input value={draftProfile.name} onChange={(event) => updateDraft('name', event.target.value)} /></label>
              <label className="field">
                <span>Latéralité</span>
                <select value={draftProfile.dominantHand} onChange={(event) => updateDraft('dominantHand', event.target.value as PlayerProfile['dominantHand'])}>
                  <option>Droitier</option><option>Gaucher</option>
                </select>
              </label>
              <NumberField label="Âge" value={draftProfile.age} min={12} max={90} onChange={(value) => updateDraft('age', value)} />
              <NumberField label="Taille (cm)" value={draftProfile.height} min={130} max={220} onChange={(value) => updateDraft('height', value)} />
            </div>
            <div className="skill-grid">
              <SkillField label="Coup droit" value={draftProfile.forehand} onChange={(value) => updateDraft('forehand', value)} />
              <SkillField label="Revers" value={draftProfile.backhand} onChange={(value) => updateDraft('backhand', value)} />
              <SkillField label="Service" value={draftProfile.serve} onChange={(value) => updateDraft('serve', value)} />
              <SkillField label="Endurance" value={draftProfile.endurance} onChange={(value) => updateDraft('endurance', value)} />
              <SkillField label="Agilité" value={draftProfile.agility} onChange={(value) => updateDraft('agility', value)} />
            </div>
            <div className="modal-actions">
              <button className="secondary-action" onClick={() => setDraftProfile(DEFAULT_PROFILE)}>Réinitialiser</button>
              <button className="primary-action" onClick={persistProfile}>Enregistrer le profil</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <span className="metric"><span>{label}</span><span><i style={{ width: `${value}%` }} /></span><strong>{value}</strong></span>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SkillField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="skill-field"><span>{label}</span><output>{value}/5</output><input type="range" min="1" max="5" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export default App;

