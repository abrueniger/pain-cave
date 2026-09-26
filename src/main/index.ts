import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { openDb } from './db'
import { parseZwo } from '../shared/zwo'
import type { BluetoothCandidate, Workout } from '../shared/types'

app.whenReady().then(() => {
  const db = openDb(join(app.getPath('userData'), 'paincave.db'))
  for (const group of ['workouts', 'rides', 'stats', 'achievements', 'settings'] as const) {
    for (const [name, fn] of Object.entries(db[group])) {
      ipcMain.handle(`${group}:${name}`, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
    }
  }
  app.on('will-quit', () => db.close())
  ipcMain.handle('workouts:importZwo', async e => {
    const opts: OpenDialogOptions = {
      title: 'Import Zwift workouts',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Zwift workouts', extensions: ['zwo'] }]
    }
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
    const result = { imported: [] as Workout[], errors: [] as { file: string; message: string }[] }
    for (const path of canceled ? [] : filePaths) {
      try {
        result.imported.push(db.workouts.save(parseZwo(readFileSync(path, 'utf8'), basename(path))))
      } catch (err) {
        result.errors.push({ file: basename(path), message: err instanceof Error ? err.message : String(err) })
      }
    }
    return result
  })

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    backgroundColor: '#141413',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })

  // Web Bluetooth: Electron has no chooser UI, the renderer shows the candidates and picks one.
  // A new requestDevice() makes Chromium drop the pending chooser, so keeping the latest callback is enough.
  let pick: ((id: string) => void) | null = null
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault()
    pick = callback
    const list: BluetoothCandidate[] = devices.map(d => ({ id: d.deviceId, name: d.deviceName }))
    win.webContents.send('bt:candidates', list)
  })
  ipcMain.on('bt:select', (_e, id: string) => {
    pick?.(id)
    pick = null
  })
  ipcMain.handle('bt:gesture', async e => {
    await e.sender.executeJavaScript(
      'Promise.resolve(window.__paincaveGesture && window.__paincaveGesture()).then(() => undefined)',
      true
    )
  })
  win.webContents.session.setBluetoothPairingHandler((_details, callback) => callback({ confirmed: true }))

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
})

app.on('window-all-closed', () => app.quit())
