import { PagePlaceholder } from '../components/PagePlaceholder'
import { AppsIcon } from '../components/icons'
import { zhCN } from '../i18n/zh-CN'

export function AppsPage(): React.JSX.Element {
  return (
    <PagePlaceholder
      {...zhCN.pages.apps}
      icon={<AppsIcon width={28} height={28} />}
    />
  )
}
