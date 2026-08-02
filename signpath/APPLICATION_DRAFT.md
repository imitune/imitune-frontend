# SignPath Foundation application draft

Do not submit until the readiness checklist at the end is complete.

## Form fields

- **Project name:** ThatSoundsLikeMe
- **Repository URL:** https://github.com/thatsoundslikeme/app
- **Homepage URL:** https://thatsoundslike.me
- **Download URL:** https://thatsoundslike.me/download.html
- **Privacy policy URL:** https://thatsoundslike.me/privacy.html
- **Wikipedia URL:** Leave blank
- **Tagline:** Search for real-world sounds by imitating them with your voice.
- **Description:** ThatSoundsLikeMe is an MIT-licensed research application for macOS, Windows and the web. A user imitates a sound with their microphone; the application runs a project-owned ONNX audio-embedding model locally, sends the resulting embedding to the project API, and returns similar sounds from Freesound. There is no background telemetry. Research feedback, including the recording, is transferred only after explicit opt-in consent under the published research study.
- **Reputation:** ThatSoundsLikeMe is an actively maintained Queen Mary University of London PhD research project supported by UK Research and Innovation (grant EP/S022694/1). The project won both “Best app for Muse Hub” and the “Other challenge” at the 2025 London Music Technology Hackathon, as recorded on its [public Devpost entry](https://devpost.com/software/imitune). The underlying model was developed from the team's first-place entry in the [Audio Engineering Society (AES)](https://aes2.org/) [AIMLA Querying by Vocal Imitation Challenge 2025](https://qvim-aes.github.io/#results). Optional research data collection has Queen Mary Ethics of Research Committee approval (reference `DSEECS25.073`) and public [participant information](https://thatsoundslike.me/participant_information_sheet.pdf) and [consent](https://thatsoundslike.me/consent_form.pdf) documents. The application has a live public website and two public desktop beta releases; [v1.0.2-beta.1](https://github.com/thatsoundslikeme/app/releases/tag/v1.0.2-beta.1) includes the unsigned Windows NSIS installer in the form for which signing is requested. The project is also preparing its beta distribution through MuseHub, whose challenge prize provides promotional support.
- **Maintainer type:** Select the closest available option for an academic/open-source team.
- **Build system:** GitHub Actions
- **Contact first name:** Christos
- **Contact last name:** Plachouras
- **Contact email:** c.plachouras@qmul.ac.uk

## Team roles for the code signing policy

- **Authors:** `chrispla`, `mimbres`, `chymaera96`
- **Reviewer for outside contributions:** `chrispla`
- **Signing approver:** `chrispla`

## Public evidence

- Source and maintenance history: https://github.com/thatsoundslikeme/app
- Current Windows release form: https://github.com/thatsoundslikeme/app/releases/tag/v1.0.2-beta.1
- Live application: https://thatsoundslike.me
- Hackathon awards: https://devpost.com/software/imitune
- Audio Engineering Society: https://aes2.org/
- AES AIMLA QVIM official results: https://qvim-aes.github.io/#results
- Research participant information: https://thatsoundslike.me/participant_information_sheet.pdf
- Research consent form: https://thatsoundslike.me/consent_form.pdf
- Privacy policy: https://thatsoundslike.me/privacy.html
- Code signing policy: https://thatsoundslike.me/code-signing-policy.html

## Eligibility statement

The project is entirely MIT licensed and does not use commercial dual
licensing. The signed package is built from project-owned source in the public
repository and contains the project-owned ONNX model plus open-source runtime
dependencies. It is not a security, administration or system-modification
tool. The installer is per-user and provides standard Windows uninstallation.
Search network access occurs only after a user requests a search; optional
audio feedback collection is disabled by default and requires explicit study
consent.

## Candid eligibility assessment

The application now meets the objective baseline conditions: public MIT source,
active maintenance, documented functionality, an existing Windows release in
the exact NSIS form to be signed, standard uninstallation, named release roles,
and a public privacy/code-signing policy. The two independent awards, academic
team, research ethics approval and MuseHub distribution relationship provide
meaningful reputation evidence for a young project.

Acceptance is still discretionary. The project has only a short public release
history and low recorded GitHub download counts, so the application should rely
on verifiable institutional, competition and distribution evidence rather than
claiming a large user base. Resolve every unchecked item below before
submission; in particular, do not describe the bundled participant documents
as open source without confirming their redistribution status.

## Readiness checklist

- [x] Merge the identity/signing preparation work to `main`.
- [x] Confirm the website deployment exposes the download, privacy and code signing policy pages.
- [x] Publish an unsigned Windows beta installer from the public repository in the form that will later be signed.
- [x] Publish SHA-256 checksums with the beta release.
- [x] Add SBOM and checksum generation to the trusted Windows release workflow.
- [ ] Publish the generated SBOM; the current `v1.0.2-beta.1` assets do not include one.
- [x] Add concrete public reputation and academic-governance evidence above.
- [ ] Confirm that the bundled participant PDFs may be distributed as part of the open-source signed package, or replace them with website links before applying.
- [ ] Confirm GitHub MFA for all listed authors and enable SignPath MFA when the account is created.
- [ ] Protect `main` and require `@chrispla` review for `CODEOWNERS` paths, including trusted-build workflows.
- [ ] Review the final form with the project owner immediately before submission.

After acceptance, install the SignPath GitHub App and configure the secret,
repository variables, signing policy and artifact configurations documented in
this directory. Those are post-acceptance setup steps, not application fields.
