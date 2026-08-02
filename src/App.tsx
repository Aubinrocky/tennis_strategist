import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  DEFAULT_PROFILE,
  OPPONENTS,
  type PlayerProfile,
  type StrokeType,
  type TacticalFeedback,
} from './domain/types';
import {
  emitOpponent,
  emitProfile,
  emitStartRally,
  emitStroke,
  onFeedback,
  onOpponentExplanation,
  onSnapshot,
  type GameSnapshot,
} from './game/events';
import { GameCanvas } from './game/GameCanvas';
import { loadProfile, saveProfile } from './storage/profile';

const INITIAL_SNAPSHOT: GameSnapshot = {
  phase: 'idle',
  instruction: 'Lance un échange pour entrer dans le laboratoire.',
  rally: 0,
};

const PHASE_LABELS: Record<GameSnapshot['phase'], string> = {
  idle: 'Prêt',
  opponent: 'Lecture',
  decision: 'À toi de jouer',
  player: 'Trajectoire',
  feedback: 'Analyse',
};

function App() {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [feedback, setFeedback] = useState<TacticalFeedback | null>(null);
  const [opponentExplanation, setOpponentExplanation] = useState(
    "Les intentions de l’adversaire apparaîtront ici pendant l’échange.",
  );
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
    const cleanSnapshot = onSnapshot(setSnapshot);
    const cleanFeedback = onFeedback(setFeedback);
    const cleanExplanation = onOpponentExplanation(setOpponentExplanation);
    const timer = window.setTimeout(() => {
      emitProfile(profile);
      emitOpponent(opponentId);
      emitStroke(stroke);
    }, 80);
    return () => {
      window.clearTimeout(timer);
      cleanSnapshot();
      cleanFeedback();
      cleanExplanation();
    };
  }, []);

  const selectOpponent = (id: typeof opponentId) => {
    setOpponentId(id);
    emitOpponent(id);
    setFeedback(null);
  };

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
    emitProfile(draftProfile);
    setSettingsOpen(false);
  };

  const start = () => {
    setFeedback(null);
    emitStartRally();
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Accueil Tennis Strategy Lab">
          <span className="brand-mark">TS</span>
          <span>
            <strong>Tennis Strategy</strong>
            <small>Decision lab</small>
          </span>
        </a>
        <div className="session-meta">
          <span className={`phase phase--${snapshot.phase}`}>
            <i /> {PHASE_LABELS[snapshot.phase]}
          </span>
          <button className="profile-button" onClick={() => setSettingsOpen(true)}>
            <span className="avatar">{profile.name.slice(0, 1).toUpperCase()}</span>
            <span>{profile.name}</span>
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
      </header>

      <section className="hero-copy" id="top">
        <div>
          <p className="eyebrow">SESSION 01 · CONSTRUIRE LE POINT</p>
          <h1>Lis. Décide. Joue.</h1>
        </div>
        <p className="hero-intro">
          Travaille tes choix dans un échange vivant. Ici, le résultat compte moins que la décision.
        </p>
      </section>

      <section className="workspace">
        <aside className="control-panel panel">
          <PanelHeading number="01" kicker="ADVERSAIRE" title="Choisis le profil" />

          <div className="opponent-list">
            {OPPONENTS.map((item) => (
              <button
                key={item.id}
                className={`opponent-card ${item.id === opponentId ? 'is-active' : ''}`}
                onClick={() => selectOpponent(item.id)}
                style={{ '--opponent-accent': item.accent } as CSSProperties}
              >
                <span className="opponent-avatar">{item.name.slice(0, 1)}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.label}</small>
                </span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>

          <div className="opponent-detail">
            <p>{opponent.description}</p>
            <Metric label="Régularité" value={opponent.consistency} />
            <Metric label="Agressivité" value={opponent.aggression} />
            <Metric label="Vitesse" value={opponent.speed} />
          </div>

          <div className="stroke-picker">
            <p className="kicker">FRAPPE ACTIVE</p>
            <div className="segmented">
              {(['lifté', 'à plat', 'slice'] as StrokeType[]).map((item) => (
                <button
                  key={item}
                  className={stroke === item ? 'is-active' : ''}
                  onClick={() => selectStroke(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <button className="primary-action" onClick={start}>
            <span>{snapshot.phase === 'idle' ? 'Lancer un échange' : 'Recommencer le point'}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </aside>

        <section className="court-stage">
          <div className="court-toolbar">
            <span>ÉCHANGE {String(snapshot.rally).padStart(2, '0')}</span>
            <span className="instruction">{snapshot.instruction}</span>
            <span>VUE TACTIQUE</span>
          </div>
          <GameCanvas />
          <div className="court-hint">
            <span><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> Se déplacer</span>
            <span><i className="mouse-icon" /> Maintenir, viser, relâcher</span>
          </div>
        </section>

        <aside className="analysis-panel panel">
          <PanelHeading number="02" kicker="COACH TACTIQUE" title="Lecture du point" />

          {feedback ? (
            <div className="feedback-card">
              <div className="score-row">
                <div className="score-ring" style={{ '--score': `${feedback.score * 3.6}deg` } as CSSProperties}>
                  <span>{feedback.score}</span>
                  <small>/100</small>
                </div>
                <div>
                  <span className={`verdict verdict--${feedback.verdict}`}>{feedback.verdict}</span>
                  <h3>{feedback.title}</h3>
                </div>
              </div>
              <p>{feedback.explanation}</p>
              <div className="factor-list">
                {feedback.factors.map((factor) => (
                  <Metric key={factor.label} label={factor.label} value={factor.value} />
                ))}
              </div>
              <div className="alternative">
                <span>↳</span>
                <p>{feedback.alternative}</p>
              </div>
            </div>
          ) : (
            <div className="empty-feedback">
              <div className="court-glyph"><span /></div>
              <h3>À toi de créer le déséquilibre</h3>
              <p>Après ta frappe, ton choix sera évalué selon la sécurité, la profondeur et le déplacement créé.</p>
            </div>
          )}

          <div className="opponent-intent">
            <p className="kicker">INTENTION ADVERSE</p>
            <p>{opponentExplanation}</p>
          </div>
        </aside>
      </section>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CALIBRATION</p>
                <h2 id="profile-title">Ton profil de jeu</h2>
              </div>
              <button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Fermer">×</button>
            </div>
            <div className="profile-grid">
              <label className="field">
                <span>Nom du joueur</span>
                <input value={draftProfile.name} onChange={(event) => updateDraft('name', event.target.value)} />
              </label>
              <label className="field">
                <span>Latéralité</span>
                <select value={draftProfile.dominantHand} onChange={(event) => updateDraft('dominantHand', event.target.value as PlayerProfile['dominantHand'])}>
                  <option>Droitier</option>
                  <option>Gaucher</option>
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

function PanelHeading({ number, kicker, title }: { number: string; kicker: string; title: string }) {
  return (
    <div className="panel-heading">
      <span>{number}</span>
      <div><p className="kicker">{kicker}</p><h2>{title}</h2></div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <div><i style={{ width: `${value}%` }} /></div>
      <strong>{value}</strong>
    </div>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SkillField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="skill-field"><span>{label}</span><output>{value}/5</output><input type="range" min="1" max="5" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export default App;

