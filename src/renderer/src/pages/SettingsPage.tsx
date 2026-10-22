import { PagePlaceholder } from '../components/PagePlaceholder'
import { SettingsIcon } from '../components/icons'
import { zhCN } from '../i18n/zh-CN'

export function SettingsPage(): React.JSX.Element {
  return (
    <PagePlaceholder
      {...zhCN.pages.settings}
      icon={<SettingsIcon width={28} height={28} />}
    />
  )
}
