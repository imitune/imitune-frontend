# SignPath release configuration

This directory documents the two-stage Windows signing flow for
ThatSoundsLikeMe. It is intentionally inactive until the SignPath Foundation
accepts the project and its GitHub App, organisation ID, project slug and
signing-policy slug have been configured.

## Artifact configurations

1. `app-executable.xml` signs the project-owned `ThatSoundsLikeMe.exe`.
2. `nsis-installer.xml` signs the final NSIS installer after it packages the
   signed application executable.

Upload each file through the SignPath project UI to create its corresponding
artifact configuration. Keep the XML in sync with the configuration shown in
the SignPath UI so release review remains reproducible.

## Required GitHub configuration

- Install the SignPath GitHub App with access to this repository only.
- Create the `SIGNPATH_API_TOKEN` repository secret for a submitter account.
- Set these repository variables: `SIGNPATH_ORGANIZATION_ID`,
  `SIGNPATH_PROJECT_SLUG`, `SIGNPATH_SIGNING_POLICY_SLUG`,
  `SIGNPATH_APP_ARTIFACT_CONFIGURATION_SLUG`, and
  `SIGNPATH_INSTALLER_ARTIFACT_CONFIGURATION_SLUG`.
- Set `SIGNPATH_ENABLED=true` only after the preceding values are configured
  and SignPath confirms the artifact configurations.

Every request remains manually approved by the designated project approver.

## Current status

The repository contains preparation only. Windows beta releases remain
unsigned, and the public code-signing policy says so explicitly. Do not set
`SIGNPATH_ENABLED=true` or describe a release as SignPath-signed until the
Foundation has accepted the project and the resulting signature has been
verified.

The application wording and evidence checklist are maintained in
`APPLICATION_DRAFT.md`. The exact acknowledgement required by SignPath is
prepared on the public policy page as conditional future wording; it does not
describe the current unsigned Windows beta.
