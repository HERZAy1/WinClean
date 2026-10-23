import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { closeDatabase, databasePath, initDatabase } from './db'
import { registerAnalysisIpc } from './ipc/analysis'
import { registerAppsIpc } from './ipc/apps'
import { registerCleanIpc } from './ipc/clean'
import { registerLlmIpc } from './ipc/llm'
import { registerFallbackHandlers } from './ipc/registry'
import { registerScanIpc } from './ipc/scan'
import { registerSettingsIpc } from './ipc/settings'
import { registerSystemIpc } from './ipc/system'
import { registerTreeIpc } from './ipc/tree'
import { AnalysisService } from './analysis/service'
import { CleanService } from './clean/service'
import { runPipelineInWorker } from './pipeline/service'
import { collectAndSaveRegistry } from './registry/service'
import { ScanService } from './scan/service'
import { initLogger, logError, logInfo } from './logging'
import { electronSecretStore } from './settings/electron-secret-store'
import { SettingsService } from './settings/service'

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
      sandbox: true,
      devTools: !app.isPackaged
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault()
    }
  })
  mainWindow.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

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
  initLogger(path.join(app.getPath('userData'), 'logs'))
  logInfo('应用启动')

  initDatabase()
  const settingsService = new SettingsService(app.getPath('userData'), electronSecretStore)
  const scanService = new ScanService()
  const analysisService = new AnalysisService(settingsService)
  const cleanService = new CleanService(settingsService)
  scanService.setOnComplete(async (scanId, drives) => {
    scanService.reportStage('collecting-registry', '正在采集已安装软件…')
    try {
      await collectAndSaveRegistry(scanId)
    } catch (error) {
      scanService.reportStage(
        'collecting-registry',
        `软件采集失败，继续分类：${error instanceof Error ? error.message : String(error)}`
      )
    }

    // 分类 / 归属 / 拆分放到 worker 线程，主进程保持响应
    try {
      await runPipelineInWorker({
        dbPath: databasePath(),
        scanId,
        drives,
        onStage: (stage, message) => scanService.reportStage(stage, message)
      })
    } catch (error) {
      logError('扫描后处理失败', error)
      scanService.reportStage(
        'error',
        `扫描后处理失败：${error instanceof Error ? error.message : String(error)}`
      )
    }
  })
  registerSettingsIpc(settingsService)
  registerLlmIpc(settingsService)
  registerSystemIpc()
  registerScanIpc(scanService)
  registerTreeIpc()
  registerAnalysisIpc(analysisService)
  registerAppsIpc()
  registerCleanIpc(cleanService)
  registerFallbackHandlers()
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
  logInfo('应用退出')
  closeDatabase()
})

void bootstrap().catch((error: unknown) => {
  logError('应用启动失败', error)
  app.quit()
})
