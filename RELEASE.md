# Desktop release process

ThatSoundsLikeMe desktop releases are built from this public repository. The
release approver is `@chrispla`.

## Release controls

1. Start from a reviewed commit on `main` with a clean working tree.
2. Set the same release version in the npm, Cargo and Tauri manifests.
3. Run web lint/build, Tauri tests, Rust formatting and Clippy, and dependency
   audits.
4. Build the Windows release on the designated Windows machine while signed in
   to Certum SimplySign. Tauri signs the application executable before it is
   packaged, then signs the outer NSIS installer. Verify both Authenticode
   signatures and their trusted timestamps before publishing.
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
The GitHub workflow produces reproducible unsigned QA artifacts; signed
Windows releases are built and signed locally because SimplySign requires the
certificate holder's interactive cloud-card session.

The detailed platform commands, Certum setup, and MuseHub checks are in
`desktop-tauri/README.md`.
