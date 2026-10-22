import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { AppsPage } from './pages/AppsPage'
import { DevUiPage } from './pages/DevUiPage'
import { FilesPage } from './pages/FilesPage'
import { SettingsPage } from './pages/SettingsPage'

export function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <Navigate
                to="/files"
                replace
              />
            }
          />
          <Route
            path="files"
            element={<FilesPage />}
          />
          <Route
            path="apps"
            element={<AppsPage />}
          />
          <Route
            path="settings"
            element={<SettingsPage />}
          />
          <Route
            path="dev/ui"
            element={<DevUiPage />}
          />
          <Route
            path="*"
            element={
              <Navigate
                to="/files"
                replace
              />
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  )
}
