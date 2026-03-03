"use client"

import { create } from "zustand"
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react"

export interface FlowEditorState {
  nodes: Node[]
  edges: Edge[]
  selectedNode: Node | null
  flowDefinitionId: string | null
  flowName: string
  flowType: string
  isDirty: boolean

  // Actions
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  onNodesChange: OnNodesChange
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  selectNode: (node: Node) => void
  deselectNode: () => void
  setFlowMeta: (meta: {
    flowDefinitionId: string | null
    flowName: string
    flowType: string
  }) => void
  markDirty: () => void
  markClean: () => void
  updateNodeData: (nodeId: string, data: Record<string, any>) => void
  deleteNode: (nodeId: string) => void
}

export const useFlowEditorStore = create<FlowEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  flowDefinitionId: null,
  flowName: "",
  flowType: "match_feedback",
  isDirty: false,

  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
      isDirty: true,
    })
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
      isDirty: true,
    })
  },

  onConnect: (connection) => {
    set({
      edges: addEdge(
        {
          ...connection,
          type: "smoothstep",
          animated: true,
        },
        get().edges
      ),
      isDirty: true,
    })
  },

  selectNode: (node) => set({ selectedNode: node }),

  deselectNode: () => set({ selectedNode: null }),

  setFlowMeta: (meta) =>
    set({
      flowDefinitionId: meta.flowDefinitionId,
      flowName: meta.flowName,
      flowType: meta.flowType,
    }),

  markDirty: () => set({ isDirty: true }),

  markClean: () => set({ isDirty: false }),

  updateNodeData: (nodeId, data) => {
    const nodes = get().nodes.map((node) => {
      if (node.id === nodeId) {
        return { ...node, data: { ...node.data, ...data } }
      }
      return node
    })
    // Also update selectedNode if it matches
    const selectedNode = get().selectedNode
    const updatedSelected =
      selectedNode && selectedNode.id === nodeId
        ? { ...selectedNode, data: { ...selectedNode.data, ...data } }
        : selectedNode
    set({ nodes, selectedNode: updatedSelected, isDirty: true })
  },

  deleteNode: (nodeId) => {
    const nodes = get().nodes.filter((n) => n.id !== nodeId)
    const edges = get().edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    )
    const selectedNode =
      get().selectedNode?.id === nodeId ? null : get().selectedNode
    set({ nodes, edges, selectedNode, isDirty: true })
  },
}))
