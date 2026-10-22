import { describe, expect, it } from 'vitest'
import type { AppTreeRoot, TreeNode } from '../../../../shared/types'
import { buildTreeLayout, moreParent } from './tree-model'

const roots: AppTreeRoot[] = [
  {
    nodeId: 'app:acme',
    label: 'Acme App',
    kind: 'app',
    totalBytes: 1000,
    childCount: 101
  }
]

function child(index: number): TreeNode {
  return {
    nodeId: `dir:C:\\Acme\\d${index}`,
    label: `d${index}`,
    kind: 'dir',
    sizeBytes: 10,
    path: `C:\\Acme\\d${index}`,
    childCount: 0
  }
}

describe('buildTreeLayout', () => {
  it('展开后增加子节点，收起后只保留根', () => {
    const collapsed = buildTreeLayout(roots, {}, '这台电脑')
    expect(collapsed.nodes).toHaveLength(2)

    const expanded = buildTreeLayout(roots, { 'app:acme': [child(0), child(1)] }, '这台电脑')
    expect(expanded.nodes).toHaveLength(4)
    expect(expanded.edges).toHaveLength(3)
  })

  it('保留 +N 分页节点', () => {
    const children = Array.from({ length: 100 }, (_, index) => child(index))
    children.push({
      nodeId: 'more:100:group:acme:install',
      label: '+1 项',
      kind: 'group',
      sizeBytes: 0,
      childCount: 1
    })
    const layout = buildTreeLayout(roots, { 'app:acme': children }, '这台电脑')
    const more = layout.nodes.find((node) => node.id.startsWith('more:'))
    expect(more?.data.isMore).toBe(true)
    expect(more?.data.label).toBe('+1 项')
    expect(moreParent('more:100:group:acme:install')).toBe('group:acme:install')
  })
})
