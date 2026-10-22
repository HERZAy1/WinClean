export const zhCN = {
  appName: '磁盘管家',
  errors: {
    mountNodeMissing: '找不到应用挂载节点'
  },
  nav: {
    label: '主导航',
    files: '文件关系树',
    apps: '软件占用',
    settings: '设置'
  },
  sidebar: {
    localAnalysis: '本地分析'
  },
  elevation: {
    warning: '当前非管理员，部分目录将无法读取',
    restart: '以管理员重启',
    restartFailed: '以管理员重启失败'
  },
  drives: {
    loading: '正在读取磁盘…',
    loadFailed: '磁盘读取失败',
    select: '选择要扫描的磁盘',
    used: '已用',
    total: '总量',
    free: '可用'
  },
  topbar: {
    scan: '开始扫描',
    scanPending: '扫描功能将在后续任务接入',
    switchToLight: '切换到浅色主题',
    switchToDark: '切换到深色主题'
  },
  settingsPage: {
    loading: '正在加载设置…',
    loadFailed: '设置加载失败',
    save: '保存设置',
    saved: '设置已保存',
    saveFailed: '设置保存失败',
    activeProvider: '当前使用的服务商',
    openai: 'OpenAI',
    anthropic: 'Claude (Anthropic)',
    baseUrl: 'Base URL',
    modelId: '模型 ID',
    modelPlaceholder: '请输入模型 ID',
    apiKey: 'API Key',
    apiKeyPlaceholder: '输入新的 API Key',
    apiKeyConfigured: '已配置·重新输入可覆盖',
    apiKeyMissing: '尚未配置',
    saveKey: '保存 Key',
    clearKey: '清除',
    keySaved: 'API Key 已加密保存',
    keyCleared: 'API Key 已清除',
    keySaveFailed: 'API Key 保存失败',
    testConnection: '测试连接',
    testRunning: '测试中…',
    testUnverified: '尚未验证',
    testVerified: '已验证',
    testFailed: '连接失败',
    testNeedsConfig: '请先填写模型 ID 并保存 API Key',
    testLatency: '延迟',
    testReply: '回复',
    providerSave: '保存配置',
    privacyTitle: '隐私授权',
    privacyDescription:
      '分析前会向所选服务商发送：路径（用户名替换为 %USERNAME%）、文件/目录名、大小、扩展名、已识别的软件名与发布者。不会发送文件内容。',
    privacySwitch: '允许向模型发送上述信息',
    generalTitle: '通用设置',
    theme: '主题',
    themeLight: '浅色',
    themeDark: '深色',
    themeSystem: '跟随系统',
    cleanMode: '清理方式',
    cleanRecycle: '移入回收站',
    cleanPermanent: '永久删除',
    permanentConfirm: '永久删除不会进入回收站，确认启用？',
    scanDrives: '扫描盘符',
    scanDrivesHint: '仅扫描勾选的本地固定磁盘。',
    providerSaved: '服务商配置已保存'
  },
  pages: {
    files: {
      eyebrow: '空间地图',
      title: '文件关系树',
      description: '扫描完成后，这里将用关系树呈现目录、文件与软件之间的归属关系。',
      emptyTitle: '还没有扫描结果',
      emptyDescription: '选择磁盘并完成扫描后，文件关系会在这里展开。'
    },
    apps: {
      eyebrow: '占用分析',
      title: '软件占用',
      description: '按软件查看本体、必要缓存与非必要缓存的占用构成。',
      emptyTitle: '还没有软件占用数据',
      emptyDescription: '完成扫描与归属分析后，软件占用会在这里汇总。'
    },
    settings: {
      eyebrow: '偏好设置',
      title: '设置',
      description: '管理主题、扫描范围、清理方式与模型连接。',
      emptyTitle: '设置页正在搭建',
      emptyDescription: '主题系统已经可用，其余设置项将在后续任务中接入。'
    },
    devUi: {
      eyebrow: '开发工具',
      title: 'UI 组件预览',
      description: '集中查看基础组件在浅色与深色主题下的表现。'
    }
  },
  devUi: {
    buttons: '按钮',
    buttonPrimary: '主操作',
    buttonSecondary: '次操作',
    buttonGhost: '幽灵按钮',
    buttonDanger: '危险操作',
    buttonDisabled: '不可用',
    badges: '标签',
    badgeNeutral: '未归属',
    badgeAccent: '分析中',
    badgeSuccess: '可清理',
    badgeWarning: '需确认',
    badgeDanger: '高风险',
    progress: '进度',
    progressDeterminate: '确定进度',
    progressIndeterminate: '不确定进度',
    form: '表单',
    inputLabel: '搜索路径',
    inputPlaceholder: '例如：C:\\Users\\Public',
    inputHint: '只展示匹配当前输入的文件与目录。',
    selectLabel: '清理方式',
    selectRecycle: '移入回收站',
    selectPermanent: '永久删除',
    switchLabel: '启用隐私保护',
    switchDescription: '发送给模型前替换路径中的用户名。',
    cardTitle: '基础卡片',
    cardDescription: '卡片只使用表面、边框与圆角 tokens，不依赖页面级样式。',
    cardAction: '查看详情'
  }
} as const
