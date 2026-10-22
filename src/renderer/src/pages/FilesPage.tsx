import { PagePlaceholder } from '../components/PagePlaceholder'
import { TreeIcon } from '../components/icons'
import { zhCN } from '../i18n/zh-CN'

export function FilesPage(): React.JSX.Element {
  return (
    <PagePlaceholder
      {...zhCN.pages.files}
      icon={<TreeIcon width={28} height={28} />}
    />
  )
}
