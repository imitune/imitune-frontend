# Third-party and asset notices

The code in this repository is MIT licensed unless a file says otherwise.
Release SBOMs are the authoritative, version-specific inventory of direct and
transitive software dependencies.

## Distributed software components

- React, Vite, Tauri and ONNX Runtime Web are distributed under their own
  open-source licences. Their exact versions and licence metadata are recorded
  in the package lockfiles and release SBOM.
- The bundled `web/public/model.onnx` is a project-owned ThatSoundsLikeMe model
  released under this repository's MIT licence. Its SHA-256 digest and intended
  use are documented in the public
  [`thatsoundslikeme/vectors`](https://github.com/thatsoundslikeme/vectors)
  repository.
- Freesound audio is never redistributed by this application. Search results
  link to Freesound, where each sound's own licence applies.

## Research documents and funding acknowledgement

The application does not distribute Queen Mary University of London or UKRI
logos. It includes a plain-text acknowledgement that the work is supported by
UK Research and Innovation under grant EP/S022694/1. The participant
information sheet and consent form are research-study documents, not software
components, and are linked from the research website rather than bundled in
desktop packages.
