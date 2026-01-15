const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  search: (embedding) => ipcRenderer.invoke('api:search', { embedding }),
  submitFeedback: (payload) => ipcRenderer.invoke('api:feedback', payload),
})