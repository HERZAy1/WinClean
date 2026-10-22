import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { closeDatabase, initDatabase } from './db'
import { registerLlmIpc } from './ipc/llm'
import { registerFallbackHandlers } from './ipc/registry'
import { registerSettingsIpc } from './ipc/settings'
import { electronSecretStore } from './settings/electron-secret-store'
import { SettingsService } from './settings/service'

function registerIpcHandlers(settingsService: SettingsService): void {
  registerSettingsIpc(settingsService)
  registerLlmIpc(settingsService)
  registerFallbackHandlers()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  const userDataOverride = process.env['WINCLEAN_USER_DATA_DIR']
  if (userDataOverride) {
    app.setPath('userData', path.resolve(userDataOverride))
  }

  await app.whenReady()

  initDatabase()
  const settingsService = new SettingsService(app.getPath('userData'), electronSecretStore)
  registerIpcHandlers(settingsService)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  closeDatabase()
})

void bootstrap()
