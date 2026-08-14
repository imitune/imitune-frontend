type MicrophoneStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isDesktopApp(): boolean {
  return isTauriApp()
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

export async function desktopSearch(embedding: number[]): Promise<DesktopApiResponse> {
  if (isTauriApp()) return tauriInvoke<DesktopApiResponse>('search', { embedding })
  throw new Error('Desktop search was requested outside a desktop application.')
}

export async function desktopSubmitFeedback(payload: unknown): Promise<DesktopApiResponse> {
  if (isTauriApp()) return tauriInvoke<DesktopApiResponse>('feedback', { payload })
  throw new Error('Desktop feedback was requested outside a desktop application.')
}

export async function getDesktopMicrophoneStatus(): Promise<MicrophoneStatus> {
  if (!isTauriApp() || !navigator.permissions?.query) return 'unknown'

  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    if (result.state === 'granted') return 'granted'
    if (result.state === 'denied') return 'denied'
    return 'not-determined'
  } catch {
    return 'unknown'
  }
}

export async function openDesktopMicrophoneSettings(): Promise<boolean> {
  if (isTauriApp()) return tauriInvoke<boolean>('open_microphone_settings')
  return false
}

function researchDocument(pathname: string): string | null {
  if (pathname.endsWith('/participant_information_sheet.pdf')) return 'participant-information'
  if (pathname.endsWith('/consent_form.pdf')) return 'consent-form'
  return null
}

export function installTauriLinkHandling(): () => void {
  if (!isTauriApp()) return () => undefined

  const handleClick = (event: MouseEvent) => {
    const element = event.target instanceof Element ? event.target : null
    const anchor = element?.closest<HTMLAnchorElement>('a[target="_blank"]')
    if (!anchor) return

    const url = new URL(anchor.href)
    const documentId = researchDocument(url.pathname)
    if (documentId) {
      event.preventDefault()
      void tauriInvoke<boolean>('open_research_document', { document: documentId }).catch(console.error)
      return
    }

    if (url.protocol === 'https:') {
      event.preventDefault()
      void tauriInvoke<boolean>('open_external', { rawUrl: url.toString() }).catch(console.error)
    }
  }

  document.addEventListener('click', handleClick)
  return () => document.removeEventListener('click', handleClick)
}
