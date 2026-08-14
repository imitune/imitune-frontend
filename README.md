# ThatSoundsLikeMe Frontend Monorepo

This repository contains the ThatSoundsLikeMe web and desktop applications.

ThatSoundsLikeMe is an open-source academic research project from researchers
at Queen Mary University of London, supported by UK Research and Innovation
(grant EP/S022694/1). It searches for real-world sounds from a vocal imitation
while keeping microphone recording and ONNX inference on the user's device.

## Recognition and research governance

- The project won both [Best app for Muse Hub and the Other challenge at the
  2025 London Music Technology Hackathon](https://devpost.com/software/imitune).
- The underlying query-by-vocal-imitation model was developed from the team's
  first-place entry in the [Audio Engineering Society
  (AES)](https://aes2.org/) [AIMLA Querying by Vocal Imitation Challenge
  2025](https://qvim-aes.github.io/#results).
- Optional research data collection is covered by Queen Mary Ethics of
  Research Committee reference `DSEECS25.073`. Data sharing is off by default;
  the [Participant Information Sheet](web/public/participant_information_sheet.pdf)
  and [Consent Form](web/public/consent_form.pdf) are presented before a user
  can opt in.

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
- [Contribution guidance](CONTRIBUTING.md)
- [Release process](RELEASE.md)

## Releases

Public desktop betas, checksums, and release notes are available on the
[GitHub releases page](https://github.com/thatsoundslikeme/app/releases). The
current macOS beta is Developer ID signed and Apple-notarized; the current
Windows beta is unsigned. Certum has issued an active Open Source Code Signing
in the Cloud certificate to Open Source Developer Christos Plachouras. The
next free, open-source Windows release will be Authenticode-signed with this
certificate and timestamped.
