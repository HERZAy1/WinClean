import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { closeDatabase, initDatabase } from './db'
import { registerAnalysisIpc } from './ipc/analysis'
import { registerLlmIpc } from './ipc/llm'
import { registerFallbackHandlers } from './ipc/registry'
import { registerScanIpc } from './ipc/scan'
import { registerSettingsIpc } from './ipc/settings'
import { registerSystemIpc } from './ipc/system'
import { registerTreeIpc } from './ipc/tree'
import { applyClassification } from './classify/apply'
import { buildRules } from './classify/rules'
import { AnalysisService } from './analysis/service'
import { applyRuleOwnership, formatOwnershipStats } from './ownership/apply'
import { collectAndSaveRegistry } from './registry/service'
import { ScanService } from './scan/service'
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
  const scanService = new ScanService()
  const analysisService = new AnalysisService(settingsService)
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

    scanService.reportStage('classifying', '正在分类系统与用户文件…')
    applyClassification(scanId, buildRules(drives))

    scanService.reportStage('rule-matching', '正在匹配软件归属…')
    const stats = applyRuleOwnership(scanId)
    scanService.reportStage('rule-matching', formatOwnershipStats(stats))
  })
  registerSettingsIpc(settingsService)
  registerLlmIpc(settingsService)
  registerSystemIpc()
  registerScanIpc(scanService)
  registerTreeIpc()
  registerAnalysisIpc(analysisService)
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
  closeDatabase()
})

void bootstrap()
