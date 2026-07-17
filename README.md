# ThatSoundLikeMe Frontend Monorepo

This repository contains the ThatSoundLikeMe web and desktop applications.

## Supported applications

- `web/` is the website deployed at [thatsoundslike.me](https://thatsoundslike.me).
- `desktop-tauri/` is the production desktop application for macOS and Windows. Tauri is the canonical and only supported desktop implementation on `main`.

The earlier Electron prototype is not part of `main` and is no longer under development. It remains available only in Git history and the historical `electron-app-v1` branch.

## Web development

- App README and setup instructions: `web/README.md`
- Start the dev server:

  ```bash
  cd web
  npm install
  npm run dev
  ```

## Desktop development

See `desktop-tauri/README.md` for local development, packaging, signing, MuseHub release checks, and platform-specific microphone requirements.
