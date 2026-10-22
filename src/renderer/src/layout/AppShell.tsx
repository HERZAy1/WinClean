import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button, ProgressBar } from '../components/ui'
import {
  AppsIcon,
  DiskIcon,
  MoonIcon,
  ScanIcon,
  SettingsIcon,
  StopIcon,
  SunIcon,
  TreeIcon
} from '../components/icons'
import { zhCN } from '../i18n/zh-CN'
import { useScanStore, scanStatusText } from '../stores/useScan'
import { useSettingsStore } from '../stores/useSettings'
import { useSystemStore } from '../stores/useSystem'
import { useThemeStore } from '../stores/useTheme'

const navigation = [
  { to: '/files', label: zhCN.nav.files, icon: TreeIcon },
  { to: '/apps', label: zhCN.nav.apps, icon: AppsIcon },
  { to: '/settings', label: zhCN.nav.settings, icon: SettingsIcon }
]

const routeMeta: Record<string, { eyebrow: string; title: string }> = {
  '/files': { eyebrow: zhCN.pages.files.eyebrow, title: zhCN.pages.files.title },
  '/apps': { eyebrow: zhCN.pages.apps.eyebrow, title: zhCN.pages.apps.title },
  '/settings': { eyebrow: zhCN.pages.settings.eyebrow, title: zhCN.pages.settings.title },
  '/dev/ui': { eyebrow: zhCN.pages.devUi.eyebrow, title: zhCN.pages.devUi.title }
}

export function AppShell(): React.JSX.Element {
  const location = useLocation()
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const elevated = useSystemStore((state) => state.elevated)
  const elevationError = useSystemStore((state) => state.elevationError)
  const loadElevation = useSystemStore((state) => state.loadElevation)
  const relaunchElevated = useSystemStore((state) => state.relaunchElevated)
  const settings = useSettingsStore((state) => state.settings)
  const loadSettings = useSettingsStore((state) => state.load)
  const scanning = useScanStore((state) => state.scanning)
  const progress = useScanStore((state) => state.progress)
  const errorCount = useScanStore((state) => state.errorCount)
  const scanError = useScanStore((state) => state.error)
  const startScan = useScanStore((state) => state.start)
  const cancelScan = useScanStore((state) => state.cancel)
  const handleProgress = useScanStore((state) => state.handleProgress)
  const handleErrorCount = useScanStore((state) => state.handleErrorCount)
  const meta = routeMeta[location.pathname] ?? routeMeta['/files']
  const isDark = resolvedTheme === 'dark'
  const themeLabel = isDark ? zhCN.topbar.switchToLight : zhCN.topbar.switchToDark
  const scanDrives = settings?.scanDrives ?? []
  const canStart = scanDrives.length > 0
  const scanLabel =
    progress?.stage === 'cancelled'
      ? zhCN.scan.cancelled
      : progress?.stage === 'error'
        ? zhCN.scan.failed
        : scanning
          ? zhCN.scan.start
          : zhCN.scan.done

  useEffect(() => {
    void loadElevation()
    if (!settings) {
      void loadSettings()
    }
  }, [loadElevation, loadSettings, settings])

  useEffect(() => {
    const unsubscribeProgress = window.api.on('event:progress', handleProgress)
    const unsubscribeErrors = window.api.on('event:scan-error-count', (payload) =>
      handleErrorCount(payload.count)
    )

    return () => {
      unsubscribeProgress()
      unsubscribeErrors()
    }
  }, [handleErrorCount, handleProgress])

  async function handleScanAction(): Promise<void> {
    if (scanning) {
      await cancelScan()
      return
    }

    await startScan(scanDrives)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">
            <DiskIcon width={20} height={20} />
          </span>
          <span className="brand__name">{zhCN.appName}</span>
        </div>

        <nav
          className="nav"
          aria-label={zhCN.nav.label}
        >
          {navigation.map((item) => {
            const Icon = item.icon

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              >
                <Icon />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__status-dot" />
          <span className="sidebar__status-text">{zhCN.sidebar.localAnalysis}</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar__context">
            <span className="topbar__eyebrow">{meta.eyebrow}</span>
            <h1 className="topbar__title">{meta.title}</h1>
          </div>

          <div className="topbar__actions">
            <Button
              variant={scanning ? 'secondary' : 'primary'}
              size="sm"
              leadingIcon={scanning ? <StopIcon /> : <ScanIcon />}
              disabled={!scanning && !canStart}
              title={!scanning && !canStart ? zhCN.scan.selectDrives : undefined}
              onClick={() => void handleScanAction()}
            >
              {scanning ? zhCN.scan.cancel : zhCN.scan.start}
            </Button>
            <button
              type="button"
              className="icon-button"
              aria-label={themeLabel}
              title={themeLabel}
              onClick={toggleTheme}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        {elevated === false ? (
          <div
            className="elevation-banner"
            role="status"
          >
            <span className="elevation-banner__text">{zhCN.elevation.warning}</span>
            {elevationError ? (
              <span className="elevation-banner__error">{elevationError}</span>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              onClick={() => void relaunchElevated()}
            >
              {zhCN.elevation.restart}
            </Button>
          </div>
        ) : null}

        {scanning || progress ? (
          <div className={`scan-status${scanError ? ' scan-status--error' : ''}`}>
            <div className="scan-status__meta">
              <span className="scan-status__message">{scanStatusText(progress)}</span>
              <span className="scan-status__counts">
                {progress?.filesScanned ?? 0} {zhCN.scan.files} · {errorCount} {zhCN.scan.errors}
              </span>
            </div>
            <ProgressBar
              value={(progress?.percent ?? 0) * 100}
              showValue
              label={scanLabel}
            />
            {progress?.currentPath ? (
              <span className="scan-status__path">{progress.currentPath}</span>
            ) : null}
            {scanError ? <span className="scan-status__error">{scanError}</span> : null}
          </div>
        ) : null}

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
