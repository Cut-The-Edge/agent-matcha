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

export interface MessageEditItem {
  nodeId: string
  stepNumber: number
  label: string
  nodeType: string
  /** The field path within config that holds the editable text */
  textField: "template" | "question" | "prompt" | "reminderTemplate"
  text: string
  /** Where in the pipeline this message appears */
  contextLabel: string
}

export type SaveStatus =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved"; timestamp: number }
  | { state: "error"; error: string }

export interface FlowEditorState {
  nodes: Node[]
  edges: Edge[]
  selectedNode: Node | null
  flowDefinitionId: string | null
  flowName: string
  flowType: string
  isDirty: boolean

  // Message editor state
  messageEditorOpen: boolean
  editingMessageId: string | null
  editingMessageDraft: string | null
  messageSaveStatus: SaveStatus

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

  // Message editor actions
  openMessageEditor: () => void
  closeMessageEditor: () => void
  selectMessage: (nodeId: string) => void
  setEditingDraft: (text: string | null) => void
  setMessageSaveStatus: (status: SaveStatus) => void
  getMessageItems: () => MessageEditItem[]
  hasUnsavedMessageDraft: () => boolean
}

/** Helper: extract editable messages from nodes in pipeline order */
function extractMessageItems(nodes: Node[], edges: Edge[]): MessageEditItem[] {
  const items: MessageEditItem[] = []

  for (const node of nodes) {
    const data = node.data as Record<string, any>
    const config = (data.config || {}) as Record<string, any>
    const nodeType = node.type || "unknown"
    let textField: MessageEditItem["textField"] | null = null
    let text = ""

    if (nodeType === "message" && config.template) {
      textField = "template"
      text = config.template
    } else if (nodeType === "decision" && config.question) {
      textField = "question"
      text = config.question
    } else if (nodeType === "feedback_collect" && config.prompt) {
      textField = "prompt"
      text = config.prompt
    } else if (nodeType === "delay" && config.reminderTemplate) {
      textField = "reminderTemplate"
      text = config.reminderTemplate
    }

    if (textField && text) {
      items.push({
        nodeId: node.id,
        stepNumber: 0, // assigned below
        label: (data.label as string) || node.id,
        nodeType,
        textField,
        text,
        contextLabel: getContextLabel(nodeType, data.label as string),
      })
    }
  }

  // Assign step numbers in the order they appear
  items.forEach((item, idx) => {
    item.stepNumber = idx + 1
  })

  return items
}

function getContextLabel(nodeType: string, label: string): string {
  switch (nodeType) {
    case "message":
      return `Message: ${label}`
    case "decision":
      return `Decision prompt: ${label}`
    case "feedback_collect":
      return `Feedback prompt: ${label}`
    case "delay":
      return `Delay reminder: ${label}`
    default:
      return label
  }
}

export const useFlowEditorStore = create<FlowEditorState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  flowDefinitionId: null,
  flowName: "",
  flowType: "match_feedback",
  isDirty: false,

  // Message editor state
  messageEditorOpen: false,
  editingMessageId: null,
  editingMessageDraft: null,
  messageSaveStatus: { state: "idle" },

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

  // Message editor actions
  openMessageEditor: () => {
    const items = extractMessageItems(get().nodes, get().edges)
    set({
      messageEditorOpen: true,
      editingMessageId: items.length > 0 ? items[0].nodeId : null,
      editingMessageDraft: null,
      messageSaveStatus: { state: "idle" },
    })
  },

  closeMessageEditor: () =>
    set({
      messageEditorOpen: false,
      editingMessageId: null,
      editingMessageDraft: null,
      messageSaveStatus: { state: "idle" },
    }),

  selectMessage: (nodeId) =>
    set({
      editingMessageId: nodeId,
      editingMessageDraft: null,
      messageSaveStatus: { state: "idle" },
    }),

  setEditingDraft: (text) => set({ editingMessageDraft: text }),

  setMessageSaveStatus: (status) => set({ messageSaveStatus: status }),

  getMessageItems: () => extractMessageItems(get().nodes, get().edges),

  hasUnsavedMessageDraft: () => {
    const { editingMessageId, editingMessageDraft, nodes } = get()
    if (!editingMessageId || editingMessageDraft === null) return false

    const node = nodes.find((n) => n.id === editingMessageId)
    if (!node) return false

    const items = extractMessageItems(nodes, get().edges)
    const item = items.find((i) => i.nodeId === editingMessageId)
    if (!item) return false

    return editingMessageDraft !== item.text
  },
}))
