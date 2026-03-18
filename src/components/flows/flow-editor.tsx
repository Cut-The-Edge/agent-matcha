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
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useFlowEditorStore } from "@/stores/flow-editor-store"
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

function FlowEditorInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null)

  const {
    nodes,
    edges,
    selectedNode,
    messageEditorOpen,
    onNodesChange,
    onEdgesChange,
    selectNode,
    deselectNode,
  } = useFlowEditorStore()

  // Allow repositioning nodes but block deletion
  const filteredOnNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const safeChanges = changes.filter((c) => c.type !== "remove")
      onNodesChange(safeChanges)
    },
    [onNodesChange]
  )

  // Block edge deletion
  const filteredOnEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const safeChanges = changes.filter((c) => c.type !== "remove")
      onEdgesChange(safeChanges)
    },
    [onEdgesChange]
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
      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={filteredOnNodesChange}
          onEdgesChange={filteredOnEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode={null}
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
      {selectedNode && !messageEditorOpen && <PropertiesPanel />}
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
