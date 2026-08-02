# Tennis Strategy Lab

POC web pour entraîner la prise de décision tactique au tennis. Le moteur évalue chaque frappe selon la sécurité, la profondeur, le déplacement créé et le coût de replacement, puis explique le choix.

## Démarrage local

Prérequis : Node.js 22.

```bash
npm install
npm run dev
```

Puis ouvrir `http://127.0.0.1:5173`.

## Commandes

- Flèches ou WASD : déplacer le joueur.
- Souris : maintenir, viser dans le camp adverse, relâcher pour frapper.
- Sélecteur latéral : choisir lifté, à plat ou slice.

## Vérification

```bash
npm test
npm run build
```

## Architecture

- `src/domain` : moteur tactique pur et tests unitaires.
- `src/game` : scène Phaser et pont événementiel avec React.
- `src/storage` : persistance locale du profil.
- `src/App.tsx` : interface, adversaires, profil et débrief.

Le moteur de domaine ne dépend pas de Phaser ou React. Le rendu peut ainsi évoluer sans modifier les règles tactiques.

## Déploiement Netlify

Le fichier `netlify.toml` configure automatiquement :

- la commande de build : `npm run build` ;
- le dossier publié : `dist` ;
- Node.js 22 ;
- la redirection SPA vers `index.html`.

Après avoir importé le dépôt GitHub dans Netlify, chaque push sur la branche de production déclenche un nouveau déploiement. Aucun paramètre supplémentaire n'est requis pour cette version sans backend.

