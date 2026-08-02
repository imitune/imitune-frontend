# Contributing to ThatSoundsLikeMe

Thank you for considering a contribution. ThatSoundsLikeMe is an academic,
open-source project and accepts focused bug fixes, accessibility improvements,
tests and documentation changes through GitHub pull requests.

## Development process

1. Open an issue before substantial changes so scope and research-data
   compatibility can be agreed.
2. Create a branch from `main` and keep the change focused.
3. Do not commit credentials, production data, participant recordings or
   generated feedback exports.
4. Run the relevant checks described in `web/README.md` or
   `desktop-tauri/README.md`.
5. Submit a pull request explaining user-visible behavior, privacy or data
   effects, and the verification performed.

Outside contributions require review by a project maintainer. Changes to
release workflows, signing configuration, security policy and desktop bundle
metadata additionally require approval from `@chrispla` under `CODEOWNERS`.

## Compatibility constraints

Do not change production API routes, embedding shape, feedback payloads,
research consent behavior or historical index identifiers without an explicit
migration plan. The pilot-only index comparison mode must not be enabled in
the public desktop application.

## Licensing

By submitting a contribution, you agree that it may be distributed under the
repository's MIT licence and that you have the right to contribute it under
those terms.
