import type { Edge, Node } from '@xyflow/react'
import { hierarchy, tree } from 'd3-hierarchy'
import type { AppTreeRoot, TreeNode } from '../../../../shared/types'

export type DiskNodeKind =
  | 'root'
  | 'app'
  | 'system'
  | 'user'
  | 'unowned'
  | 'dir'
  | 'file'
  | 'registry'
  | 'group'

export interface DiskNodeData {
  [key: string]: unknown
  nodeId: string
  label: string
  kind: DiskNodeKind
  sizeBytes: number
  childCount: number
  path?: string
  confidence?: number
  reason?: string
  hasChildren: boolean
  expanded: boolean
  loading: boolean
  isMore: boolean
}

interface TreeDatum extends DiskNodeData {
  children: TreeDatum[]
}

export interface TreeLayout {
  nodes: Node<DiskNodeData>[]
  edges: Edge[]
}

function fromRoot(root: AppTreeRoot, expanded: Record<string, TreeNode[]>): TreeDatum {
  const children = (expanded[root.nodeId] ?? []).map((child) =>
    fromTreeNode(child, expanded)
  )
  return {
    nodeId: root.nodeId,
    label: root.label,
    kind: root.kind,
    sizeBytes: root.totalBytes,
    childCount: root.childCount,
    hasChildren: root.childCount > 0,
    expanded: Boolean(expanded[root.nodeId]),
    loading: false,
    isMore: false,
    children
  }
}

function fromTreeNode(node: TreeNode, expanded: Record<string, TreeNode[]>): TreeDatum {
  const isMore = node.nodeId.startsWith('more:')
  const children = (expanded[node.nodeId] ?? []).map((child) =>
    fromTreeNode(child, expanded)
  )
  return {
    nodeId: node.nodeId,
    label: node.label,
    kind: isMore ? 'group' : node.kind,
    sizeBytes: node.sizeBytes,
    childCount: node.childCount,
    path: node.path,
    confidence: node.confidence,
    reason: node.reason,
    hasChildren: node.childCount > 0 || isMore,
    expanded: Boolean(expanded[node.nodeId]),
    loading: false,
    isMore,
    children
  }
}

export function buildTreeLayout(
  roots: AppTreeRoot[],
  expanded: Record<string, TreeNode[]>,
  centerLabel: string,
  loading: Set<string> = new Set()
): TreeLayout {
  const center: TreeDatum = {
    nodeId: 'root:center',
    label: centerLabel,
    kind: 'root',
    sizeBytes: roots.reduce((sum, root) => sum + root.totalBytes, 0),
    childCount: roots.length,
    hasChildren: roots.length > 0,
    expanded: true,
    loading: false,
    isMore: false,
    children: roots.map((root) => fromRoot(root, expanded))
  }

  const root = hierarchy(center)
  tree<TreeDatum>().nodeSize([190, 110])(root)

  const nodes: Node<DiskNodeData>[] = root.descendants().map((item) => ({
    id: item.data.nodeId,
    type: 'disk',
    position: { x: item.x ?? 0, y: item.y ?? 0 },
    data: {
      nodeId: item.data.nodeId,
      label: item.data.label,
      kind: item.data.kind,
      sizeBytes: item.data.sizeBytes,
      childCount: item.data.childCount,
      path: item.data.path,
      confidence: item.data.confidence,
      reason: item.data.reason,
      hasChildren: item.data.hasChildren,
      expanded: item.data.expanded,
      loading: loading.has(item.data.nodeId),
      isMore: item.data.isMore
    }
  }))

  const edges: Edge[] = root
    .links()
    .map((link) => ({
      id: `${link.source.data.nodeId}->${link.target.data.nodeId}`,
      source: link.source.data.nodeId,
      target: link.target.data.nodeId,
      type: 'smoothstep',
      animated: false
    }))

  return { nodes, edges }
}

export function moreParent(nodeId: string): string {
  const second = nodeId.indexOf(':', 5)
  return second >= 0 ? nodeId.slice(second + 1) : ''
}
