# Desktop release process

ThatSoundsLikeMe desktop releases are built from this public repository. The
release approver is `@chrispla`; every future SignPath signing request will
require manual approval.

## Release controls

1. Start from a reviewed commit on `main` with a clean working tree.
2. Set the same release version in the npm, Cargo and Tauri manifests.
3. Run web lint/build, Tauri tests, Rust formatting and Clippy, and dependency
   audits.
4. Build the Windows executable and installer on a GitHub-hosted Windows
   runner. SignPath, once approved and enabled, signs the project executable
   first and the outer NSIS installer second.
5. Build the universal macOS application, sign it with the Queen Mary
   University of London Developer ID Application identity, notarize it with
   Apple, staple the notarization ticket and verify both architectures.
6. Test installation, uninstallation, microphone permission, search,
   Freesound playback, opt-in feedback and rate-limit messages on each target
   operating system.
7. Publish binaries with SHA-256 checksums, an SBOM and release notes that
   accurately state the signing status of every platform.

The Windows release workflow produces an SPDX JSON SBOM and checksum file next
to the final installer. The SBOM action is pinned to an immutable commit; review
dependency-action updates like any other trusted-build change.

Unsigned Windows beta releases may be published for testing only when they are
prominently labelled unsigned in both the release notes and download policy.
After SignPath is enabled, public Windows releases must use the trusted
GitHub-hosted build and manual signing-approval flow in `.github/workflows`.

The detailed platform commands and MuseHub checks are in
`desktop-tauri/README.md`. SignPath artifact configuration and post-acceptance
setup are documented in `signpath/README.md`.
