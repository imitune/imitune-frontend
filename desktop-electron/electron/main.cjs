const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const log = require('electron-log')
const { autoUpdater } = require('electron-updater')

// Rule out GPU-related blank window issues
app.disableHardwareAcceleration()

// Website backend (from your website Network tab)
const DEFAULT_BACKEND_BASE = 'https://imitune-backend-steel.vercel.app'
const BACKEND_BASE = process.env.BACKEND_BASE || DEFAULT_BACKEND_BASE

// Must match an allowed origin in imitune-backend CORS validation
const ALLOWED_ORIGIN_FOR_ELECTRON = 'https://thatsoundslike.me'

log.initialize()
autoUpdater.logger = log
autoUpdater.autoDownload = true

function setupAutoUpdates() {
  autoUpdater.on('checking-for-update', () => log.info('[updater] checking-for-update'))
  autoUpdater.on('update-available', (info) => log.info('[updater] update-available', info))
  autoUpdater.on('update-not-available', (info) => log.info('[updater] update-not-available', info))
  autoUpdater.on('download-progress', (p) => log.info('[updater] download-progress', p))
  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] update-downloaded', info)
    // Default behavior: install on quit (safer than forcing a restart mid-session)
  })
  autoUpdater.on('error', (err) => log.error('[updater] error', err))

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => log.error('[updater] check failed', e))
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer console:${level}] ${message} (${sourceId}:${line})`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[render-process-gone]', details)
  })
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error('[did-fail-load]', { errorCode, errorDescription, validatedURL })
  })

  const isDev = !app.isPackaged

  if (isDev) {
    const startUrl = process.env.ELECTRON_START_URL
    if (startUrl) {
      console.log('[electron] loading', startUrl)
      win.loadURL(startUrl).catch((e) => console.error('[loadURL error]', e))
      win.webContents.openDevTools()
      return
    }

    const ports = []
    for (let p = 5173; p <= 5250; p++) ports.push(p)

    const tryLoad = async () => {
      for (const p of ports) {
        const url = `http://localhost:${p}/`
        try {
          console.log('[electron] trying', url)
          await win.loadURL(url)
          win.webContents.openDevTools()
          return
        } catch (e) {
          console.error('[loadURL error]', url, e?.message || e)
        }
      }
      await win.loadURL('data:text/plain,Could not find Vite dev server on ports 5173-5250')
      win.webContents.openDevTools()
    }

    void tryLoad()
  } else {
    // Packaged: resources live under Contents/Resources on macOS
    const indexPath = path.join(process.resourcesPath, 'web', 'dist-electron', 'index.html')
    win.loadFile(indexPath).catch((e) => console.error('[loadFile error]', e))
  }
}

ipcMain.handle('api:search', async (_evt, { embedding }) => {
  const res = await fetch(`${BACKEND_BASE}/api/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN_FOR_ELECTRON,
    },
    body: JSON.stringify({ embedding }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json
})

ipcMain.handle('api:feedback', async (_evt, payload) => {
  const res = await fetch(`${BACKEND_BASE}/api/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ALLOWED_ORIGIN_FOR_ELECTRON,
    },
    body: JSON.stringify(payload),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json
})

app.whenReady().then(() => {
  createWindow()
  setupAutoUpdates()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})