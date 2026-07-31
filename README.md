# ThatSoundLikeMe Frontend Monorepo

This repository contains the ThatSoundLikeMe web and desktop applications.

## Supported applications

- `web/` is the website deployed at [thatsoundslike.me](https://thatsoundslike.me).
- `desktop-tauri/` is the production desktop application for macOS and Windows. Tauri is the canonical and only supported desktop implementation on `main`.

The earlier Electron prototype is not maintained. Tauri is the only supported desktop implementation.

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

## Project policies

- [Privacy policy](web/public/privacy.html)
- [Code signing policy](web/public/code-signing-policy.html)
- [Download and release information](web/public/download.html)
- [Security policy](SECURITY.md)
- [Third-party and asset notices](THIRD_PARTY_NOTICES.md)
