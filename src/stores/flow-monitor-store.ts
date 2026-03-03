"use client"

import { create } from "zustand"

interface FlowMonitorState {
  /** Node ID selected from the timeline (highlights node in diagram) */
  selectedLogNodeId: string | null
  /** Node ID being hovered in either diagram or timeline */
  highlightedNodeId: string | null

  selectLogNode: (nodeId: string | null) => void
  highlightNode: (nodeId: string | null) => void
}

export const useFlowMonitorStore = create<FlowMonitorState>((set) => ({
  selectedLogNodeId: null,
  highlightedNodeId: null,

  selectLogNode: (nodeId) => set({ selectedLogNodeId: nodeId }),
  highlightNode: (nodeId) => set({ highlightedNodeId: nodeId }),
}))
