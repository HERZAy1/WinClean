import type { RiskLevel, SizeCategory } from '../../shared/types'
import { normalizePath } from '../scan/path'

export interface BreakdownRule {
  id: string
  pattern: RegExp
  category: SizeCategory
  riskLevel: RiskLevel
  reason: string
}

export interface BreakdownContext {
  installLocation?: string
}

export interface BreakdownClassification {
  category: SizeCategory
  riskLevel: RiskLevel
  reason: string
  ruleId: string
}

const SENSITIVE_RULES: BreakdownRule[] = [
  { id: 'documents', pattern: /\\documents(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '用户文档' },
  { id: 'desktop', pattern: /\\desktop(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '桌面文件' },
  { id: 'pictures', pattern: /\\pictures(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '用户图片' },
  { id: 'videos', pattern: /\\videos(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '用户视频' },
  { id: 'music', pattern: /\\music(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '用户音乐' },
  { id: 'downloads', pattern: /\\downloads(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '下载内容' },
  { id: 'wechat-files', pattern: /\\wechat files(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '微信聊天文件' },
  { id: 'msg', pattern: /\\msg(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '聊天记录' },
  { id: 'chat', pattern: /\\chat(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '聊天数据' },
  { id: 'messages', pattern: /\\messages(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '消息数据' },
  { id: 'databases', pattern: /\\databases?(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '数据库' },
  { id: 'saves', pattern: /\\saves?(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '存档数据' },
  { id: 'savegames', pattern: /\\savegames(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '游戏存档' },
  { id: 'local-storage', pattern: /\\local storage(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '本地登录态' },
  { id: 'indexeddb', pattern: /\\indexeddb(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '浏览器数据库' },
  { id: 'models', pattern: /\\models?(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '模型文件' },
  { id: 'config', pattern: /\\config(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '用户配置' },
  { id: 'settings', pattern: /\\settings(\\|$)/i, category: 'essentialCache', riskLevel: 'high', reason: '用户设置' }
]

const DISPOSABLE_RULES: BreakdownRule[] = [
  { id: 'cache', pattern: /\\cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '可再生缓存' },
  { id: 'cache2', pattern: /\\cache2(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '可再生缓存' },
  { id: 'code-cache', pattern: /\\code cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '代码缓存' },
  { id: 'gpu-cache', pattern: /\\gpucache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'GPU 缓存' },
  { id: 'dawn-cache', pattern: /\\dawncache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Dawn 缓存' },
  { id: 'gr-shader-cache', pattern: /\\grshadercache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '着色器缓存' },
  { id: 'shader-cache', pattern: /\\shadercache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '着色器缓存' },
  { id: 'd3d-cache', pattern: /\\d3dscache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Direct3D 缓存' },
  { id: 'nv-cache', pattern: /\\nv_cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'NVIDIA 缓存' },
  { id: 'amd-cache', pattern: /\\amdcache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'AMD 缓存' },
  { id: 'blob-storage', pattern: /\\blob_storage(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '临时 Blob 数据' },
  { id: 'service-worker-cache', pattern: /\\service worker\\cachestorage(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Service Worker 缓存' },
  { id: 'cachestorage', pattern: /\\cachestorage(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'CacheStorage 缓存' },
  { id: 'temp', pattern: /\\temp(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '临时文件' },
  { id: 'tmp', pattern: /\\tmp(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '临时文件' },
  { id: 'logs', pattern: /\\logs?(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '日志文件' },
  { id: 'crashpad', pattern: /\\crashpad(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '崩溃上报缓存' },
  { id: 'crashdumps', pattern: /\\crashdumps(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '崩溃转储' },
  { id: 'dumps', pattern: /\\dumps(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '转储文件' },
  { id: 'crash-reports', pattern: /\\crashreports(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '崩溃报告' },
  { id: 'downloading', pattern: /\\downloading(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '下载残留' },
  { id: 'depotcache', pattern: /\\depotcache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Steam depot 缓存' },
  { id: 'pip-cache', pattern: /\\pip\\cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'pip 缓存' },
  { id: 'npm-cache', pattern: /\\npm-cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'npm 缓存' },
  { id: 'node-gyp', pattern: /\\node-gyp(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'node-gyp 缓存' },
  { id: 'gradle-caches', pattern: /\\\.gradle\\caches(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Gradle 缓存' },
  { id: 'm2-repository', pattern: /\\\.m2\\repository(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Maven 缓存' },
  { id: 'nuget-packages', pattern: /\\\.nuget\\packages(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'NuGet 缓存' },
  { id: 'windows-update', pattern: /\\softwaredistribution\\download(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Windows 更新下载' },
  { id: 'thumbnails', pattern: /\\thumbnails(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '缩略图缓存' },
  { id: 'inetcache', pattern: /\\inetcache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'IE 缓存' },
  { id: 'webcache', pattern: /\\webcache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'Web 缓存' },
  { id: 'recent', pattern: /\\recent(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '最近使用记录' },
  { id: 'update-cache', pattern: /\\update cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '更新缓存' },
  { id: 'download-cache', pattern: /\\download cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '下载缓存' },
  { id: 'component-cache', pattern: /\\component cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '组件缓存' },
  { id: 'packages-cache', pattern: /\\packages\\cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '包缓存' },
  { id: 'startup-cache', pattern: /\\startupcache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '启动缓存' },
  { id: 'shader-cache-2', pattern: /\\shader_cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: '着色器缓存' },
  { id: 'gpu-cache-2', pattern: /\\gpu_cache(\\|$)/i, category: 'disposableCache', riskLevel: 'low', reason: 'GPU 缓存' }
]

export function classifyBreakdownPath(
  pathValue: string,
  context: BreakdownContext = {}
): BreakdownClassification {
  const normalized = normalizePath(pathValue).toLowerCase()

  for (const rule of SENSITIVE_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        category: rule.category,
        riskLevel: rule.riskLevel,
        reason: rule.reason,
        ruleId: rule.id
      }
    }
  }

  for (const rule of DISPOSABLE_RULES) {
    if (rule.pattern.test(normalized)) {
      return {
        category: rule.category,
        riskLevel: rule.riskLevel,
        reason: rule.reason,
        ruleId: rule.id
      }
    }
  }

  if (context.installLocation) {
    const install = normalizePath(context.installLocation).toLowerCase()
    if (normalized === install || normalized.startsWith(`${install}\\`)) {
      return {
        category: 'body',
        riskLevel: 'low',
        reason: '软件安装目录内的本体文件',
        ruleId: 'body-install'
      }
    }
  }

  return {
    category: 'essentialCache',
    riskLevel: 'medium',
    reason: '未命中缓存规则，保守归为必要数据',
    ruleId: 'essential-default'
  }
}

export { SENSITIVE_RULES, DISPOSABLE_RULES }
