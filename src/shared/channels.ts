export const CHANNELS = {
  app: {
    isElevated: 'app:isElevated',
    relaunchElevated: 'app:relaunchElevated'
  },
  settings: {
    get: 'settings:get',
    save: 'settings:save',
    setApiKey: 'settings:setApiKey',
    clearApiKey: 'settings:clearApiKey'
  },
  llm: {
    testConnection: 'llm:testConnection'
  },
  drives: {
    list: 'drives:list'
  },
  scan: {
    start: 'scan:start',
    cancel: 'scan:cancel',
    latest: 'scan:latest'
  },
  analysis: {
    start: 'analysis:start',
    cancel: 'analysis:cancel'
  },
  tree: {
    getRoots: 'tree:getRoots',
    getChildren: 'tree:getChildren'
  },
  unowned: {
    list: 'unowned:list',
    explain: 'unowned:explain'
  },
  apps: {
    list: 'apps:list',
    getBreakdown: 'apps:getBreakdown'
  },
  clean: {
    preview: 'clean:preview',
    execute: 'clean:execute',
    log: 'clean:log'
  },
  shell: {
    showItemInFolder: 'shell:showItemInFolder'
  },
  events: {
    progress: 'event:progress',
    llmThinking: 'event:llm-thinking',
    scanErrorCount: 'event:scan-error-count'
  }
} as const

export type EventChannel = (typeof CHANNELS.events)[keyof typeof CHANNELS.events]

export type CommandChannel =
  | (typeof CHANNELS.app)[keyof typeof CHANNELS.app]
  | (typeof CHANNELS.settings)[keyof typeof CHANNELS.settings]
  | (typeof CHANNELS.llm)[keyof typeof CHANNELS.llm]
  | (typeof CHANNELS.drives)[keyof typeof CHANNELS.drives]
  | (typeof CHANNELS.scan)[keyof typeof CHANNELS.scan]
  | (typeof CHANNELS.analysis)[keyof typeof CHANNELS.analysis]
  | (typeof CHANNELS.tree)[keyof typeof CHANNELS.tree]
  | (typeof CHANNELS.unowned)[keyof typeof CHANNELS.unowned]
  | (typeof CHANNELS.apps)[keyof typeof CHANNELS.apps]
  | (typeof CHANNELS.clean)[keyof typeof CHANNELS.clean]
  | (typeof CHANNELS.shell)[keyof typeof CHANNELS.shell]

export type IpcChannel = CommandChannel | EventChannel

export const COMMAND_CHANNELS = [
  ...Object.values(CHANNELS.app),
  ...Object.values(CHANNELS.settings),
  ...Object.values(CHANNELS.llm),
  ...Object.values(CHANNELS.drives),
  ...Object.values(CHANNELS.scan),
  ...Object.values(CHANNELS.analysis),
  ...Object.values(CHANNELS.tree),
  ...Object.values(CHANNELS.unowned),
  ...Object.values(CHANNELS.apps),
  ...Object.values(CHANNELS.clean),
  ...Object.values(CHANNELS.shell)
] as const satisfies readonly CommandChannel[]

export const ALL_CHANNELS = [
  ...COMMAND_CHANNELS,
  ...Object.values(CHANNELS.events)
] as const satisfies readonly IpcChannel[]
