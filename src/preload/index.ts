import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CHANNELS, type CommandChannel, type EventChannel } from '../shared/channels'
import type {
  AppSettings,
  AppTreeRoot,
  CleanLogEntry,
  CleanPlan,
  CleanResult,
  DriveInfo,
  Result,
  SizeBreakdown,
  TestConnectionResult,
  TreeNode,
  UnownedExplain
} from '../shared/types'
import type { EventPayloadMap, UnownedListResult, WinCleanApi } from './api'

async function invoke<T>(channel: CommandChannel, payload?: unknown): Promise<Result<T>> {
  try {
    return (await ipcRenderer.invoke(channel, payload)) as Result<T>
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'INTERNAL',
        message: '未实现',
        detail: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

function subscribe<K extends EventChannel>(
  channel: K,
  callback: (payload: EventPayloadMap[K]) => void
): () => void {
  const listener = (_event: IpcRendererEvent, payload: EventPayloadMap[K]): void => {
    callback(payload)
  }

  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: WinCleanApi = {
  app: {
    isElevated: () => invoke<boolean>(CHANNELS.app.isElevated),
    relaunchElevated: () => invoke<void>(CHANNELS.app.relaunchElevated)
  },
  settings: {
    get: () => invoke<AppSettings>(CHANNELS.settings.get),
    save: (settings) => invoke<AppSettings>(CHANNELS.settings.save, settings),
    setApiKey: (input) => invoke<void>(CHANNELS.settings.setApiKey, input),
    clearApiKey: (input) => invoke<void>(CHANNELS.settings.clearApiKey, input)
  },
  llm: {
    testConnection: (input) =>
      invoke<TestConnectionResult>(CHANNELS.llm.testConnection, input),
    listModels: (input) => invoke<string[]>(CHANNELS.llm.listModels, input)
  },
  drives: {
    list: () => invoke<DriveInfo[]>(CHANNELS.drives.list)
  },
  scan: {
    start: (input) => invoke<{ scanId: number }>(CHANNELS.scan.start, input),
    cancel: () => invoke<void>(CHANNELS.scan.cancel),
    latest: () => invoke<{ scanId: number } | null>(CHANNELS.scan.latest)
  },
  analysis: {
    start: (input) => invoke<void>(CHANNELS.analysis.start, input),
    cancel: () => invoke<void>(CHANNELS.analysis.cancel)
  },
  tree: {
    getRoots: (input) => invoke<AppTreeRoot[]>(CHANNELS.tree.getRoots, input),
    getChildren: (input) => invoke<TreeNode[]>(CHANNELS.tree.getChildren, input)
  },
  unowned: {
    list: (input) => invoke<UnownedListResult>(CHANNELS.unowned.list, input),
    explain: (input) => invoke<UnownedExplain[]>(CHANNELS.unowned.explain, input)
  },
  apps: {
    list: (input) => invoke<SizeBreakdown[]>(CHANNELS.apps.list, input),
    getBreakdown: (input) => invoke<SizeBreakdown>(CHANNELS.apps.getBreakdown, input)
  },
  clean: {
    preview: (input) => invoke<CleanPlan>(CHANNELS.clean.preview, input),
    execute: (input) => invoke<CleanResult>(CHANNELS.clean.execute, input),
    log: (input) => invoke<CleanLogEntry[]>(CHANNELS.clean.log, input)
  },
  shell: {
    showItemInFolder: (input) => invoke<void>(CHANNELS.shell.showItemInFolder, input)
  },
  on: subscribe
}

contextBridge.exposeInMainWorld('api', api)
