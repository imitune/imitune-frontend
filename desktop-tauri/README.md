# ThatSoundsLikeMe Tauri Desktop

The canonical Tauri 2 macOS and Windows distribution of the existing `thatsoundslike.me` React application. The native product name is `ThatSoundsLikeMe`; the website's visible branding remains unchanged. It reuses the same web UI, local ONNX embedding model, production backend routes, consent flow, and Freesound results.

## Production architecture

| Feature | Tauri implementation | Production behavior |
| --- | --- | --- |
| Voice embedding | Bundled React UI, ONNX model and WASM runtime | Runs locally; search audio does not leave the device |
| Search | Fixed Rust `search` command | `POST /api/search`, exact backend validation, Upstash rate limit, Pinecone, four results |
| Optional feedback | Fixed Rust `feedback` command | `POST /api/feedback`, existing consent flow, validated audio/ratings, Vercel Blob |
| External links | HTTPS-only Rust command | Opens the system browser; the WebView cannot select an API route |
| Research PDFs | Allowlisted Rust command | Opens only the two packaged documents |

The application does not include the pilot `/dev` index-selection mode. Rust accepts only the fixed production search and feedback routes, caps request and response sizes, uses HTTPS outside localhost development, does not retry rate-limit responses, and returns status/rate-limit metadata to the shared UI.

## Microphone and audio compatibility

- macOS includes `NSMicrophoneUsageDescription` and the audio-input entitlement. The operating-system prompt appears only after the microphone button is pressed.
- Windows uses WebView2's audio-only `getUserMedia` permission flow. A denied request exposes a button for Windows microphone privacy settings.
- The capture stream is released after every take, so the operating-system microphone indicator does not remain active between recordings.
- Chromium/WebView2 and recent WebKit record Opus/WebM. Older WebKit versions, including macOS 12, may record AAC/MP4. The UI detects the actual `MediaRecorder` type and converts unsupported containers to mono PCM WAV before optional feedback upload. Search inference and preview still use the locally decoded recording.
- Camera, screen capture and other native capabilities are not granted to the Tauri window.

## Native icon treatment

- macOS uses the bird on a padded warm rounded-square tile with a restrained native-style shadow, so it has the expected Dock and Finder silhouette.
- Windows uses the same bird without a background and with a transparent safety margin, so Windows can place it cleanly in the taskbar, Start menu, shortcuts, and installer UI.
- The editable platform masters and untouched bird artwork live in `../desktop-assets`. The website logo is not changed by the desktop icon treatment.

## Prerequisites

Install Node.js 24 and the stable Rust toolchain. For a universal Mac build:

```bash
rustup component add rustfmt clippy
rustup target add x86_64-apple-darwin aarch64-apple-darwin
```

Install the existing web dependencies and the small Tauri CLI package:

```bash
npm ci --prefix web
npm ci --prefix desktop-tauri
```

## Development and verification

```bash
cd desktop-tauri
npm run dev
npm run verify
```

`npm run verify` runs the Rust unit tests, formatting check, Clippy with warnings denied, and the Tauri-targeted production web build. Also run dependency advisory checks before release:

```bash
npm audit --prefix ../web
npm audit
cargo audit --file src-tauri/Cargo.lock
```

The GitHub `Tauri QA` workflow builds unsigned macOS universal and Windows x64 packages on their native operating systems.

## Local QA packages

On macOS:

```bash
npm run package:mac
```

Output:

```text
src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app
```

On the Windows test machine:

```powershell
npm ci --prefix ..\web
npm ci
npm run verify
npm run package:win
```

The Windows command creates an unsigned x64 NSIS installer below `src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis`.

## MuseHub macOS release

MuseHub's recommended application format is a ZIP containing a self-contained `.app`. The configured bundle is universal, has bundle ID `me.thatsoundslikeme.desktop`, requires macOS 12+, contains no updater, and packages both consent documents.

Install a **Developer ID Application** certificate and configure one Tauri-supported notarization credential set:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_API_KEY=YOUR_KEY_ID
export APPLE_API_ISSUER=YOUR_ISSUER_ID
export APPLE_API_KEY_PATH=/absolute/path/to/AuthKey_KEYID.p8
npm run dist:mac
```

Apple ID credentials (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`) are also supported. The release command refuses to run without both a signing identity and notarization credentials, builds the universal `.app`, then creates:

```text
dist/ThatSoundsLikeMe-1.0.1-mac-universal.zip
```

Verify before upload:

```bash
codesign --verify --deep --strict --verbose=2 "src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app"
spctl --assess --type execute --verbose=4 "src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app"
xcrun stapler validate "src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app"
```

## MuseHub Windows release

The Windows release uses Certum Open Source Code Signing in the Cloud. This
certificate is for software that remains free and open source; obtain a
different certificate before any commercial distribution.

Official references: [Certum activation](https://support.certum.eu/en/how-to-activate-code-signing-simplysign/),
[required documents](https://support.certum.eu/en/code-signing-required-documents/),
and [cloud signing with SignTool](https://support.certum.eu/en/signing-the-code-using-tools-like-signtool-and-jarsigner-instruction/).

Certificate activation is a one-time manual process. Certum requires identity
verification, a utility bill in the subscriber's name, and the URL of the
public ongoing open-source project. After Certum issues the certificate:

1. Install the official SimplySign mobile app and SimplySign Desktop on the
   Windows release machine.
2. Activate the SimplySign account from Certum's emails and sign in to the
   virtual card in SimplySign Desktop.
3. Install the Windows SDK so Microsoft's `signtool.exe` is available. Tauri
   locates it through the normal Windows SDK installation.
4. From this directory, generate the ignored local configuration from the
   currently available Certum code-signing certificate:

   ```powershell
   npm run prepare:win-signing
   ```

   If more than one Certum code-signing certificate is available, rerun it
   with the thumbprint printed by the script:

   ```powershell
   npm run prepare:win-signing -- -CertificateThumbprint THUMBPRINT
   ```

The generated `src-tauri/tauri.windows.release.conf.json` contains only the
certificate thumbprint, SHA-256 digest selection and Certum timestamp URL. It
is ignored by Git. The private key remains in Certum's cloud service and is
never exported to the repository or GitHub Actions.

Run:

```powershell
npm run dist:win
```

Keep SimplySign Desktop signed in and approve its signing prompts. Tauri signs
the application executable before creating the installer, then signs the outer
NSIS installer. The command fails unless both files have a valid Certum
Authenticode signature and trusted timestamp. The final installer is below
`src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis`.

Tauri's NSIS installer supports silent installation with `/S`, installs
per-user, registers with Add/Remove Programs, and downloads the WebView2
bootstrapper silently only when the runtime is absent.

Test on a clean Windows account:

1. Install normally and with `ThatSoundsLikeMe-setup.exe /S`.
2. Launch from MuseHub and confirm install-state/application-ID detection.
3. Grant microphone access, record and play a query, then search and play all four Freesound results.
4. Submit like/dislike feedback after consent.
5. Deny microphone access, open Windows privacy settings from the error UI, re-enable it, and record again.
6. Confirm the backend displays `429` after more than twenty searches per minute rather than retrying.
7. Uninstall through MuseHub and Add/Remove Programs.

## Release gates

- Deploy the hardened backend branch and configure production Upstash credentials. `X-RateLimit-Limit: 0` identifies the previous fail-open deployment and is not release-ready.
- macOS MuseHub artifacts must be Developer ID signed, Apple-notarized and verified. Until the Certum certificate is issued and used, a Windows beta may be uploaded only when it is explicitly labelled unsigned and accompanied by a published SHA-256 checksum; production Windows releases must be signed.
- Publish an SBOM with production releases. The `v1.0.2-beta.1` release predates this gate and contains checksums but no SBOM.
- Free MuseHub products require no licensing integration. Paid products must use the MuseHub-approved DRM or Muse SDK flow before signing and packaging.
