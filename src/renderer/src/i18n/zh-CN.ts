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
  topbar: {
    scan: '开始扫描',
    scanPending: '扫描功能将在后续任务接入',
    switchToLight: '切换到浅色主题',
    switchToDark: '切换到深色主题'
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
