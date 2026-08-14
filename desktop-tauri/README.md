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

MuseHub requested a signed and notarized PKG for ThatSoundsLikeMe. The installer contains only the self-contained app, runs without custom scripts or UI, and installs it into `/Applications`. The app is universal, has bundle ID `me.thatsoundslikeme.desktop`, requires macOS 12+, contains no updater, and packages both consent documents.

Install both Apple distribution identities:

- **Developer ID Application** signs the app bundle.
- **Developer ID Installer** signs the PKG.

Store notarization credentials in the login Keychain once:

```bash
xcrun notarytool store-credentials "ThatSoundsLikeMe-notary" \
  --apple-id "YOUR_APPLE_ID" \
  --team-id "YOUR_TEAM_ID" \
  --password "YOUR_APP_SPECIFIC_PASSWORD"
```

Then configure the release identities and Keychain profile:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Queen Mary University of London (TEAMID)"
export APPLE_INSTALLER_SIGNING_IDENTITY="Developer ID Installer: Queen Mary University of London (TEAMID)"
export APPLE_NOTARY_KEYCHAIN_PROFILE="ThatSoundsLikeMe-notary"
npm run dist:mac
```

The release command refuses to run unless both signing identities and the notarization profile are available. It builds and signs the universal app, creates and signs the PKG, submits the PKG to Apple, staples the accepted ticket, verifies the installer, and writes:

```text
dist/ThatSoundsLikeMe_1.0.3_mac-universal.pkg
dist/ThatSoundsLikeMe_1.0.3_mac-universal.pkg.sha256
```

Verify before upload:

```bash
codesign --verify --deep --strict --verbose=2 "src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app"
spctl --assess --type execute --verbose=4 "src-tauri/target/universal-apple-darwin/release/bundle/macos/ThatSoundsLikeMe.app"
pkgutil --check-signature "dist/ThatSoundsLikeMe_1.0.3_mac-universal.pkg"
spctl --assess --type install --verbose=4 "dist/ThatSoundsLikeMe_1.0.3_mac-universal.pkg"
xcrun stapler validate "dist/ThatSoundsLikeMe_1.0.3_mac-universal.pkg"
```

## MuseHub Windows release

The Windows release uses Certum Open Source Code Signing in the Cloud. This
certificate is for software that remains free and open source; obtain a
different certificate before any commercial distribution.

Official references: [Certum activation](https://support.certum.eu/en/how-to-activate-code-signing-simplysign/),
[required documents](https://support.certum.eu/en/code-signing-required-documents/),
and [cloud signing with SignTool](https://support.certum.eu/en/signing-the-code-using-tools-like-signtool-and-jarsigner-instruction/).

Certificate issuance and SimplySign activation are one-time manual steps. With
the active certificate:

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

Keep SimplySign Desktop signed in and approve its signing prompts. The release
script signs the application executable, rebuilds the NSIS installer from that
signed executable, then signs the outer installer. The command fails unless
both files have a valid Certum Authenticode signature and trusted timestamp.
The final installer is below
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
- macOS MuseHub artifacts must be Developer ID signed, Apple-notarized and verified. Windows betas uploaded before a valid Certum signature exists must be explicitly labelled unsigned and accompanied by a published SHA-256 checksum; production Windows releases must be signed.
- Publish an SBOM with production releases. The `v1.0.2-beta.1` release predates this gate and contains checksums but no SBOM.
- Free MuseHub products require no licensing integration. Paid products must use the MuseHub-approved DRM or Muse SDK flow before signing and packaging.
