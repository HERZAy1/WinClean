import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { Badge } from '../ui'
import { DiskIcon, SettingsIcon, TreeIcon } from '../icons'
import { formatBytes } from '../../lib/format'
import type { DiskNodeData } from './tree-model'

function iconFor(kind: DiskNodeData['kind']): React.JSX.Element {
  if (kind === 'registry') {
    return <SettingsIcon width={14} height={14} />
  }
  if (kind === 'file' || kind === 'dir') {
    return <TreeIcon width={14} height={14} />
  }
  return <DiskIcon width={14} height={14} />
}

export function DiskNode({ data }: NodeProps<Node<DiskNodeData>>): React.JSX.Element {
  return (
    <div className={`tree-node tree-node--${data.kind}${data.isMore ? ' tree-node--more' : ''}`}>
      <Handle
        type="target"
        position={Position.Top}
      />
      <div className="tree-node__header">
        <span className="tree-node__icon">{iconFor(data.kind)}</span>
        <span className="tree-node__label">{data.label}</span>
        {data.confidence !== undefined ? (
          <Badge tone="accent">{Math.round(data.confidence * 100)}%</Badge>
        ) : null}
      </div>
      <div className="tree-node__meta">
        <span>{data.isMore ? `${data.childCount} 项` : formatBytes(data.sizeBytes)}</span>
        {data.loading ? <span>加载中…</span> : null}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
      />
    </div>
  )
}
