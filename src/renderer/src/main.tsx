import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import '../styles/tokens.css'
import '../styles/base.css'
import './components/ui/ui.css'
import '../styles/shell.css'
import { initializeTheme } from './stores/useTheme'
import { zhCN } from './i18n/zh-CN'

initializeTheme()

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(zhCN.errors.mountNodeMissing)
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
