/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean
      search: (embedding: number[]) => Promise<unknown>
      submitFeedback: (payload: unknown) => Promise<unknown>
    }
  }
}

export {}