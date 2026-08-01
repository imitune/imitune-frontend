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
- **Description:** ThatSoundsLikeMe is an open-source research application for macOS, Windows and the web. A user imitates a sound with their microphone; the application runs an ONNX audio-embedding model locally, sends the resulting embedding to the project API, and returns similar sounds from Freesound. Research feedback, including the recording, is stored only after explicit opt-in consent.
- **Reputation:** ThatSoundsLikeMe is an actively maintained Queen Mary University of London PhD research project supported by UK Research and Innovation (grant EP/S022694/1). It has been used in research pilots and has a public web application, source repositories and release history. Add links here to the MuseHub/Devpost recognition and any public pilot, publication, presentation or usage evidence before submission.
- **Maintainer type:** Select the closest available option for an academic/open-source team.
- **Build system:** GitHub Actions
- **Contact first name:** Christos
- **Contact last name:** Plachouras
- **Contact email:** c.plachouras@qmul.ac.uk

## Team roles for the code signing policy

- **Authors:** `chrispla`, `mimbres`, `chymaera96`
- **Reviewer for outside contributions:** `chrispla`
- **Signing approver:** `chrispla`

## Readiness checklist

- [ ] Merge the identity/signing preparation pull request to `main`.
- [ ] Confirm the website deployment exposes the download, privacy and code signing policy pages.
- [ ] Publish an unsigned Windows beta installer from the public repository in the form that will later be signed.
- [ ] Publish checksums and SBOMs with the beta release.
- [ ] Add concrete reputation links/evidence to the text above.
- [ ] Confirm GitHub MFA for all listed authors and enable SignPath MFA when the account is created.
- [ ] Review the final form with the project owner immediately before submission.

After acceptance, install the SignPath GitHub App and configure the secret,
repository variables, signing policy and artifact configurations documented in
this directory. Those are post-acceptance setup steps, not application fields.
