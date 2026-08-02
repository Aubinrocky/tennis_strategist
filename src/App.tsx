import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_PROFILE,
  OPPONENTS,
  type PlayerProfile,
  type StrokeType,
  type TacticalFeedback,
} from './domain/types';
import {
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
  instruction: 'Préparation de la simulation…',
  rally: 0,
};

const PHASE_LABELS: Record<GameSnapshot['phase'], string> = {
  idle: 'Préparation',
  opponent: 'Frappe adverse',
  bounce: 'Après le rebond',
  decision: 'À toi de jouer',
  player: 'Ta trajectoire',
  feedback: 'Analyse',
  'point-over': 'Point terminé',
};

type CoachMessage = {
  id: number;
  kind: 'system' | 'opponent' | 'player';
  rally: number;
  label: string;
  title: string;
  body: string;
  alternative?: string;
  score?: number;
  verdict?: TacticalFeedback['verdict'];
  contact?: string;
  outcome?: TacticalFeedback['outcome'];
  wing?: TacticalFeedback['wing'];
};

function App() {
  const [screen, setScreen] = useState<'lobby' | 'match'>('lobby');
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT);
  const [coachMessages, setCoachMessages] = useState<CoachMessage[]>([]);
  const [opponentId, setOpponentId] = useState(OPPONENTS[0].id);
  const [stroke, setStroke] = useState<StrokeType>('lifté');
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [draftProfile, setDraftProfile] = useState<PlayerProfile>(profile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const snapshotRef = useRef(INITIAL_SNAPSHOT);
  const messageIdRef = useRef(0);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const opponent = useMemo(
    () => OPPONENTS.find((item) => item.id === opponentId) ?? OPPONENTS[0],
    [opponentId],
  );

  useEffect(() => {
    const cleanSnapshot = onSnapshot((nextSnapshot) => {
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
    });
    const cleanFeedback = onFeedback((nextFeedback) => {
      setCoachMessages((current) => [
        ...current,
        {
          id: ++messageIdRef.current,
          kind: 'player',
          rally: snapshotRef.current.rally,
          label: 'Ton choix',
          title: nextFeedback.shotLabel,
          body: nextFeedback.explanation,
          alternative: nextFeedback.alternative,
          score: nextFeedback.score,
          verdict: nextFeedback.verdict,
          contact: nextFeedback.contactQuality,
          outcome: nextFeedback.outcome,
          wing: nextFeedback.wing,
        },
      ]);
    });
    const cleanOpponent = onOpponentExplanation((explanation) => {
      setCoachMessages((current) => [
        ...current,
        {
          id: ++messageIdRef.current,
          kind: 'opponent',
          rally: snapshotRef.current.rally,
          label: 'Choix adverse',
          title: 'Lecture de la réponse',
          body: explanation,
        },
      ]);
    });
    return () => {
      cleanSnapshot();
      cleanFeedback();
      cleanOpponent();
    };
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [coachMessages]);

  useEffect(() => {
    if (screen !== 'match' || snapshot.phase !== 'decision') return;
    const handleStrokeShortcut = (event: KeyboardEvent) => {
      if (event.key !== '1' && event.key !== '2' && event.key !== '3') return;
      const choices: StrokeType[] = ['lifté', 'à plat', 'slice'];
      const nextStroke = choices[Number(event.key) - 1];
      setStroke(nextStroke);
      emitStroke(nextStroke);
    };
    window.addEventListener('keydown', handleStrokeShortcut);
    return () => window.removeEventListener('keydown', handleStrokeShortcut);
  }, [screen, snapshot.phase]);

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
    messageIdRef.current = 1;
    setCoachMessages([
      {
        id: 1,
        kind: 'system',
        rally: 0,
        label: 'Début de session',
        title: `${opponent.name} · ${opponent.label}`,
        body: 'Le coach consignera ici chaque décision de l’échange pour que tu puisses revenir dessus à tout moment.',
      },
    ]);
    setSnapshot(INITIAL_SNAPSHOT);
    setScreen('match');
  };

  const leaveMatch = () => {
    setSnapshot(INITIAL_SNAPSHOT);
    setScreen('lobby');
  };

  if (screen === 'match') {
    return (
      <main className="match-shell">
        <section className="match-court-area">
          <GameCanvas profile={profile} opponentId={opponentId} stroke={stroke} />
        </section>

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
          {snapshot.contactLabel && (
            <div className="contact-live">
              <strong>{snapshot.contactLabel}</strong>
              {snapshot.timeLeft !== undefined && (
                <>
                  <em>{(snapshot.timeLeft / 1000).toFixed(1)} s</em>
                  <span><i style={{ width: `${Math.max(0, Math.min(100, (snapshot.timeLeft / (snapshot.timeTotal ?? 520)) * 100))}%` }} /></span>
                </>
              )}
            </div>
          )}
          {snapshot.phase === 'point-over' && (
            <button className="next-point-button" onClick={emitStartRally}>Nouveau point <span>→</span></button>
          )}
        </div>

        <div className={`match-controls ${snapshot.phase === 'decision' ? 'is-focus' : ''}`} aria-label="Type de frappe">
          <span>{snapshot.phase === 'decision' ? 'CHOISIS' : 'FRAPPE'}</span>
          {(['lifté', 'à plat', 'slice'] as StrokeType[]).map((item, index) => (
            <button
              key={item}
              className={stroke === item ? 'is-active' : ''}
              onClick={() => selectStroke(item)}
              disabled={snapshot.phase !== 'decision'}
            >
              <kbd>{index + 1}</kbd>{item}
            </button>
          ))}
        </div>

        <div className="match-help">
          <span><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> bouger</span>
          <span><i className="mouse-icon" /> rejoindre la balle · viser · relâcher vite</span>
        </div>

        <aside className="coach-sidebar" aria-label="Historique du coach tactique">
          <header className="coach-sidebar__header">
            <div className="coach-avatar">C</div>
            <div>
              <span>COACH TACTIQUE</span>
              <h2>Analyse du match</h2>
            </div>
            <i title="Session active" />
          </header>
          <div className="coach-thread">
            {coachMessages.map((message) => (
              <article key={message.id} className={`coach-message coach-message--${message.kind}`}>
                <div className="coach-message__meta">
                  <span>{message.rally ? `ÉCHANGE ${String(message.rally).padStart(2, '0')}` : 'SESSION'}</span>
                  <span>{message.label}</span>
                </div>
                <div className="coach-message__title">
                  <h3>{message.title}</h3>
                  {message.score !== undefined && (
                    <strong className={`coach-score coach-score--${message.verdict}`}>{message.score}</strong>
                  )}
                </div>
                {message.contact && (
                  <div className={`coach-contact coach-contact--${message.outcome}`}>
                    {message.wing ? `${message.wing} · ` : ''}Contact {message.contact}{message.outcome === 'out' ? ' · balle dehors' : message.outcome === 'net' ? ' · filet' : message.outcome === 'miss' ? ' · manquée' : ' · balle bonne'}
                  </div>
                )}
                <p>{message.body}</p>
                {message.alternative && (
                  <div className="coach-alternative"><span>Alternative</span><p>{message.alternative}</p></div>
                )}
              </article>
            ))}
            <div ref={threadEndRef} />
          </div>
          <footer className="coach-sidebar__footer">
            <span className="live-dot" />
            L’analyse s’enrichit automatiquement à chaque frappe
          </footer>
        </aside>
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
