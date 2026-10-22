import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node
} from '@xyflow/react'
import type { AppTreeRoot, TreeNode } from '../../../../shared/types'
import { zhCN } from '../../i18n/zh-CN'
import { DiskNode } from './DiskNode'
import {
  buildTreeLayout,
  moreParent,
  type DiskNodeData
} from './tree-model'

interface TreeViewProps {
  scanId: number
  roots: AppTreeRoot[]
  onSelect: (node: DiskNodeData) => void
}

const nodeTypes = { disk: DiskNode }

function TreeCanvas({ scanId, roots, onSelect }: TreeViewProps): React.JSX.Element {
  const [expanded, setExpanded] = useState<Record<string, TreeNode[]>>({})
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const { fitView } = useReactFlow()

  useEffect(() => {
    const timer = setTimeout(() => {
      void fitView({ padding: 0.25, duration: 300 })
    }, 80)
    return () => clearTimeout(timer)
  }, [fitView, roots])

  const layout = useMemo(
    () => buildTreeLayout(roots, expanded, zhCN.filesPage.center, loading),
    [expanded, loading, roots]
  )

  async function fetchChildren(nodeId: string): Promise<void> {
    setLoading((current) => new Set(current).add(nodeId))
    setError(null)
    const result = await window.api.tree.getChildren({ scanId, nodeId })
    setLoading((current) => {
      const next = new Set(current)
      next.delete(nodeId)
      return next
    })
    if (!result.ok) {
      setError(result.error.message)
      return
    }

    if (nodeId.startsWith('more:')) {
      const parent = moreParent(nodeId)
      setExpanded((current) => {
        const existing = (current[parent] ?? []).filter(
          (item) => !item.nodeId.startsWith('more:')
        )
        return { ...current, [parent]: [...existing, ...result.data] }
      })
      return
    }

    setExpanded((current) => ({ ...current, [nodeId]: result.data }))
  }

  async function handleNodeClick(node: Node<DiskNodeData>): Promise<void> {
    onSelect(node.data)
    if (node.data.isMore) {
      await fetchChildren(node.data.nodeId)
      return
    }

    if (expanded[node.data.nodeId]) {
      setExpanded((current) => {
        const next = { ...current }
        delete next[node.data.nodeId]
        return next
      })
      return
    }

    if (node.data.hasChildren) {
      await fetchChildren(node.data.nodeId)
    }
  }

  return (
    <div className="tree-canvas">
      <div className="tree-canvas__toolbar">
        <button
          type="button"
          className="tree-reset"
          onClick={() => void fitView({ padding: 0.25, duration: 300 })}
        >
          {zhCN.filesPage.resetView}
        </button>
      </div>
      {error ? <div className="tree-error">{error}</div> : null}
      <ReactFlow
        nodes={layout.nodes}
        edges={layout.edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => void handleNodeClick(node as Node<DiskNodeData>)}
        onlyRenderVisibleElements
        fitView
        minZoom={0.2}
        maxZoom={1.6}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: false }}
      >
        <Background
          gap={24}
          size={1}
        />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  )
}

export function TreeView(props: TreeViewProps): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <TreeCanvas {...props} />
    </ReactFlowProvider>
  )
}
