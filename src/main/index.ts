import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
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

// 判断当前进程是否以管理员身份运行（SAM 文件仅管理员可读）
function isRunningAsAdmin(): boolean {
  try {
    fs.accessSync('C:\\Windows\\System32\\config\\SAM', fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

const runningAsAdmin = isRunningAsAdmin()

// 发行包清单强制 requireAdministrator（electron-builder.yml），提升进程下 Chromium 沙箱
// 无法创建 GPU / 渲染子进程，实测报 "GPU process launch failed: error_code=18" 后
// 直接 FATAL 退出（异常码 0x80000003）。应用只加载本地打包内容，远程请求都在主进程
// 发起，因此发行版始终关闭沙箱；开发态仅在管理员运行时关闭。
if (app.isPackaged || runningAsAdmin) {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
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
  logInfo(
    app.isPackaged || runningAsAdmin
      ? '应用启动（已关闭 Chromium 沙箱：提升进程下沙箱无法创建子进程）'
      : '应用启动（普通权限，沙箱开启）'
  )

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

// 单实例：两个实例共用 %APPDATA%\winclean，会互相争抢 GPU 缓存与 LevelDB 锁
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const existing = BrowserWindow.getAllWindows()[0]
    if (existing) {
      if (existing.isMinimized()) {
        existing.restore()
      }
      existing.focus()
    }
  })

  void bootstrap().catch((error: unknown) => {
    logError('应用启动失败', error)
    app.quit()
  })
}
