# ThatSoundsLike Desktop (Electron)

Electron wrapper around the existing Vite/React UI in `../web`, using the same Vercel backend.

## Prerequisites

- Node.js (recommended: LTS)
- npm

From this folder:

```bash
cd desktop-electron
npm install
```

Also install web dependencies once:

```bash
cd ../web
npm install
```

## Dev

This starts the web Vite dev server and then launches Electron.

```bash
cd desktop-electron
npm run dev
```

### (Optional) Pin the dev URL

If you don’t want Electron to scan ports `5173-5250`, set:

```bash
export ELECTRON_START_URL=http://localhost:5173/
```

Then run `npm run dev`.

## Backend URL

Electron main-process requests go to:

- Default: `https://imitune-backend-steel.vercel.app`
- Override with:

```bash
export BACKEND_BASE=https://imitune-backend-steel.vercel.app
```

The main process sets an `Origin` header (`https://thatsoundslike.me`) because the backend enforces an origin allowlist.

## Build + Package (macOS DMG/ZIP)

Builds the web app into `../web/dist-electron` (using `../web/vite.electron.config.ts`) and then packages Electron.

```bash
cd desktop-electron
npm run dist
```

Artifacts are written to:

- `desktop-electron/dist/`

### Faster local packaged test (no installer)

```bash
cd desktop-electron
npm run package
```

## How it works

- `electron/preload.cjs` exposes `window.electronAPI` with:
  - `isElectron: true`
  - `search(embedding)` → IPC `api:search`
  - `submitFeedback(payload)` → IPC `api:feedback`
- `electron/main.cjs` handles those IPC calls and `fetch()`es:
  - `${BACKEND_BASE}/api/search`
  - `${BACKEND_BASE}/api/feedback`

## Packaging notes

- Web build output: `../web/dist-electron`
- Packaged app includes it via electron-builder `extraResources`:
  - `Resources/web/dist-electron/*`
- Packaged window loads:
  - `path.join(process.resourcesPath, 'web', 'dist-electron', 'index.html')`

## Troubleshooting

### Blank window in packaged app

Usually means the HTML wasn’t found in the app bundle.

- Confirm `desktop-electron/package.json` has `extraResources` pointing to `../web/dist-electron`.
- Confirm `electron/main.cjs` loads `process.resourcesPath/web/dist-electron/index.html`.

### Search fails in packaged app ("Origin not allowed")

The backend validates `Origin`. Electron main-process `fetch()` does not include one by default.

- Confirm `electron/main.cjs` sets `Origin: https://thatsoundslike.me` on both `/api/search` and `/api/feedback` requests.

### Dev: Electron can’t find the Vite server

- Start Vite in `../web` first, or run `npm run dev` from `desktop-electron`.
- Or set `ELECTRON_START_URL` to the correct `http://localhost:<port>/`.
