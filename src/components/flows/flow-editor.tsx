"use client"

import { useCallback, useRef } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useFlowEditorStore } from "@/stores/flow-editor-store"
import { NodePalette } from "@/components/flows/node-palette"
import { PropertiesPanel } from "@/components/flows/properties-panel"

import { StartNode } from "@/components/flows/nodes/start-node"
import { MessageNode } from "@/components/flows/nodes/message-node"
import { DecisionNode } from "@/components/flows/nodes/decision-node"
import { FeedbackNode } from "@/components/flows/nodes/feedback-node"
import { ActionNode } from "@/components/flows/nodes/action-node"
import { DelayNode } from "@/components/flows/nodes/delay-node"
import { ConditionNode } from "@/components/flows/nodes/condition-node"
import { EndNode } from "@/components/flows/nodes/end-node"

const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  decision: DecisionNode,
  feedback_collect: FeedbackNode,
  action: ActionNode,
  delay: DelayNode,
  condition: ConditionNode,
  end: EndNode,
}

// Default configs for newly created nodes
const DEFAULT_CONFIGS: Record<string, Record<string, any>> = {
  start: { triggerType: "match_created" },
  message: { template: "", channel: "whatsapp" },
  decision: { question: "", options: [] },
  feedback_collect: {
    feedbackType: "match_reaction",
    categories: [],
    allowFreeText: true,
  },
  action: { actionType: "notify_admin", params: {} },
  delay: { duration: 24, unit: "hours" },
  condition: { expression: "", trueEdgeId: "", falseEdgeId: "" },
  end: { endType: "completed" },
}

const NODE_LABELS: Record<string, string> = {
  start: "Start",
  message: "New Message",
  decision: "Decision",
  feedback_collect: "Collect Feedback",
  action: "Action",
  delay: "Delay",
  condition: "Condition",
  end: "End",
}

function FlowEditorInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const {
    nodes,
    edges,
    selectedNode,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
    deselectNode,
  } = useFlowEditorStore()

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()

      const type = event.dataTransfer.getData("application/reactflow")
      if (!type) return

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: {
          label: NODE_LABELS[type] || type,
          config: { ...(DEFAULT_CONFIGS[type] || {}) },
        },
      }

      useFlowEditorStore.getState().setNodes([
        ...useFlowEditorStore.getState().nodes,
        newNode,
      ])
      useFlowEditorStore.getState().markDirty()
    },
    [screenToFlowPosition]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node)
    },
    [selectNode]
  )

  const onPaneClick = useCallback(() => {
    deselectNode()
  }, [deselectNode])

  return (
    <div className="flex h-full flex-1">
      <NodePalette />
      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
          }}
          className="bg-background"
        >
          <Controls />
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
      </div>
      {selectedNode && <PropertiesPanel />}
    </div>
  )
}

export function FlowEditor() {
  return (
    <ReactFlowProvider>
      <FlowEditorInner />
    </ReactFlowProvider>
  )
}
