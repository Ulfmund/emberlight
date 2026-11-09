import { app } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateStatus } from '@shared/types'

const { autoUpdater } = electronUpdater

export type UpdateController = {
  status(): UpdateStatus
  check(): Promise<void>
  download(): Promise<void>
  install(): void
}

const RECHECK_MS = 4 * 60 * 60 * 1000

/**
 * Self-update from the public GitHub Releases of Ulfmund/emberlight (configured under
 * `publish` in electron-builder.yml). Nothing downloads until the player clicks Update.
 * Only active in the installed app; development builds report "disabled".
 */
export function createUpdater(): UpdateController {
  if (!app.isPackaged) {
    return { status: () => ({ state: 'disabled' }), check: async () => {}, download: async () => {}, install: () => {} }
  }

  const current = app.getVersion()
  let status: UpdateStatus = { state: 'idle', current }
  let version = ''

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    if (status.state !== 'downloading' && status.state !== 'ready') status = { state: 'checking', current }
  })
  autoUpdater.on('update-available', (info) => {
    version = info.version
    status = { state: 'available', current, version }
  })
  autoUpdater.on('update-not-available', () => {
    status = { state: 'none', current }
  })
  autoUpdater.on('download-progress', (p) => {
    status = { state: 'downloading', current, version, percent: Math.round(p.percent) }
  })
  autoUpdater.on('update-downloaded', (info) => {
    status = { state: 'ready', current, version: info.version }
  })
  autoUpdater.on('error', (err) => {
    const offline = /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::ERR/i.test(String(err?.message))
    // Being offline isn't worth bothering the player about; just look again later.
    status = offline
      ? { state: 'none', current }
      : { state: 'error', current, version: version || undefined, message: 'The update could not be downloaded. Try again later.' }
  })

  const check = async () => {
    if (status.state === 'downloading' || status.state === 'ready') return
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      /* reported through the 'error' event */
    }
  }

  // Check shortly after start-up, then every few hours while the app stays open.
  setTimeout(() => void check(), 3000)
  setInterval(() => void check(), RECHECK_MS)

  return {
    status: () => status,
    check,
    download: async () => {
      if (status.state !== 'available' && status.state !== 'error') return
      status = { state: 'downloading', current, version, percent: 0 }
      try {
        await autoUpdater.downloadUpdate()
      } catch {
        /* reported through the 'error' event */
      }
    },
    install: () => {
      if (status.state !== 'ready') return
      // Close the app, run the new installer silently, and start the new version.
      setImmediate(() => autoUpdater.quitAndInstall(true, true))
    }
  }
}
