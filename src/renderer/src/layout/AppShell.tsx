import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Button } from '../components/ui'
import { AppsIcon, DiskIcon, MoonIcon, ScanIcon, SettingsIcon, SunIcon, TreeIcon } from '../components/icons'
import { zhCN } from '../i18n/zh-CN'
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
  const meta = routeMeta[location.pathname] ?? routeMeta['/files']
  const isDark = resolvedTheme === 'dark'
  const themeLabel = isDark ? zhCN.topbar.switchToLight : zhCN.topbar.switchToDark

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
              variant="primary"
              size="sm"
              leadingIcon={<ScanIcon />}
              disabled
              title={zhCN.topbar.scanPending}
            >
              {zhCN.topbar.scan}
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

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
