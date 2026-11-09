import 'dotenv/config'
import { app, BrowserWindow, safeStorage, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../server'
import icon from '../../resources/icon.png?asset'

// Must match DEV_SERVER_PORT in electron.vite.config.ts.
const DEV_SERVER_PORT = 41730
const here = dirname(fileURLToPath(import.meta.url))
const devUrl = process.env.ELECTRON_RENDERER_URL

let serverPort = 0

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0809',
    icon,
    title: 'Emberlight',
    // A custom, game-style title bar: the page draws the bar, Windows draws the buttons.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0809', symbolColor: '#e8d5a8', height: 40 },
    webPreferences: { contextIsolation: true, sandbox: true }
  })
  win.once('ready-to-show', () => win.show())

  // Links to other sites open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  await win.loadURL(devUrl ?? `http://127.0.0.1:${serverPort}/`)
}

app.whenReady().then(async () => {
  const server = await startServer({
    dataDir: app.getPath('userData'),
    // Windows DPAPI via Electron: keys can only be decrypted by this Windows user on this PC.
    cipher: {
      available: await safeStorage.isAsyncEncryptionAvailable(),
      encrypt: (s) => safeStorage.encryptStringAsync(s),
      decrypt: async (b) => (await safeStorage.decryptStringAsync(b)).result
    },
    staticDir: devUrl ? undefined : join(here, '../renderer'),
    devOrigins: devUrl ? [new URL(devUrl).origin] : undefined,
    port: DEV_SERVER_PORT,
    portFallback: !devUrl
  })
  serverPort = server.port
  console.log(`Emberlight local server: http://127.0.0.1:${serverPort}/`)
  app.on('before-quit', () => server.close())

  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
