"use client"

import { useMemo } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  type Node,
  type Edge,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { withMonitorStatus } from "./monitor-node-wrapper"
import { StartNode } from "@/components/flows/nodes/start-node"
import { MessageNode } from "@/components/flows/nodes/message-node"
import { DecisionNode } from "@/components/flows/nodes/decision-node"
import { FeedbackNode } from "@/components/flows/nodes/feedback-node"
import { ActionNode } from "@/components/flows/nodes/action-node"
import { DelayNode } from "@/components/flows/nodes/delay-node"
import { ConditionNode } from "@/components/flows/nodes/condition-node"
import { EndNode } from "@/components/flows/nodes/end-node"

import type { MonitorNodeStatus, TraversedEdge } from "@/hooks/use-node-statuses"
import { useFlowMonitorStore } from "@/stores/flow-monitor-store"

// Wrap all node types with monitor HOC
const monitorNodeTypes = {
  start: withMonitorStatus(StartNode),
  message: withMonitorStatus(MessageNode),
  decision: withMonitorStatus(DecisionNode),
  feedback_collect: withMonitorStatus(FeedbackNode),
  action: withMonitorStatus(ActionNode),
  delay: withMonitorStatus(DelayNode),
  condition: withMonitorStatus(ConditionNode),
  end: withMonitorStatus(EndNode),
}

interface FlowNode {
  nodeId: string
  type: string
  label: string
  position: { x: number; y: number }
  config: any
}

interface FlowEdge {
  edgeId: string
  source: string
  target: string
  label?: string
  condition?: string
}

interface MonitorDiagramProps {
  definitionNodes: FlowNode[]
  definitionEdges: FlowEdge[]
  nodeStatuses: Record<string, MonitorNodeStatus>
  traversedEdges: TraversedEdge[]
}

function MonitorDiagramInner({
  definitionNodes,
  definitionEdges,
  nodeStatuses,
  traversedEdges,
}: MonitorDiagramProps) {
  const { selectedLogNodeId } = useFlowMonitorStore()

  // Build a set of traversed edge keys for quick lookup
  const traversedEdgeSet = useMemo(() => {
    const set = new Set<string>()
    for (const te of traversedEdges) {
      set.add(`${te.source}->${te.target}`)
      if (te.edgeId) set.add(te.edgeId)
    }
    return set
  }, [traversedEdges])

  // Find the latest traversed edge (last one in the array)
  const latestEdge = traversedEdges.length > 0
    ? traversedEdges[traversedEdges.length - 1]
    : null

  // Convert definition nodes to ReactFlow nodes with status data
  const nodes: Node[] = useMemo(
    () =>
      definitionNodes.map((n) => ({
        id: n.nodeId,
        type: n.type,
        position: n.position,
        data: {
          label: n.label,
          config: n.config,
          __monitorStatus: nodeStatuses[n.nodeId] || "idle",
          __isSelected: selectedLogNodeId === n.nodeId,
        },
        draggable: false,
        connectable: false,
        selectable: false,
      })),
    [definitionNodes, nodeStatuses, selectedLogNodeId]
  )

  // Convert definition edges to ReactFlow edges with status styling
  const edges: Edge[] = useMemo(
    () =>
      definitionEdges.map((e) => {
        const key = `${e.source}->${e.target}`
        const isTraversed = traversedEdgeSet.has(key) || traversedEdgeSet.has(e.edgeId)
        const isLatest =
          latestEdge &&
          latestEdge.source === e.source &&
          latestEdge.target === e.target

        let style: Record<string, any> = { stroke: "#94a3b8", strokeWidth: 1.5 }
        let animated = false

        if (isLatest) {
          style = { stroke: "#3b82f6", strokeWidth: 3 }
          animated = true
        } else if (isTraversed) {
          style = { stroke: "#22c55e", strokeWidth: 2 }
          animated = true
        }

        return {
          id: e.edgeId,
          source: e.source,
          target: e.target,
          sourceHandle: e.condition || undefined,
          type: "smoothstep",
          animated,
          style,
          label: e.label,
        }
      }),
    [definitionEdges, traversedEdgeSet, latestEdge]
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={monitorNodeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      fitView
      proOptions={{ hideAttribution: true }}
      className="bg-background"
    >
      <Controls showInteractive={false} />
      <MiniMap
        zoomable
        pannable
        className="!bg-muted !border !border-border"
      />
      <Background
        variant={BackgroundVariant.Dots}
        gap={16}
        size={1}
        className="!bg-background"
      />
    </ReactFlow>
  )
}

export function MonitorDiagram(props: MonitorDiagramProps) {
  return (
    <ReactFlowProvider>
      <MonitorDiagramInner {...props} />
    </ReactFlowProvider>
  )
}
