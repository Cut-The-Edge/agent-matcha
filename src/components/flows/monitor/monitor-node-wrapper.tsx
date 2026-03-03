"use client"

import { type ComponentType } from "react"
import { type NodeProps } from "@xyflow/react"
import type { MonitorNodeStatus } from "@/hooks/use-node-statuses"

const STATUS_RING: Record<MonitorNodeStatus, string> = {
  idle: "",
  active: "ring-2 ring-blue-500 animate-pulse",
  completed: "ring-2 ring-green-500",
  waiting: "ring-2 ring-amber-500 animate-pulse",
  error: "ring-2 ring-red-500",
}

const STATUS_BADGE: Record<MonitorNodeStatus, { label: string; className: string } | null> = {
  idle: null,
  active: { label: "Running", className: "bg-blue-500 text-white" },
  completed: { label: "Done", className: "bg-green-500 text-white" },
  waiting: { label: "Waiting", className: "bg-amber-500 text-white" },
  error: { label: "Error", className: "bg-red-500 text-white" },
}

/**
 * HOC that wraps existing node components with monitor status visuals.
 * Reads `__monitorStatus` from node data and applies ring + badge.
 */
export function withMonitorStatus(
  WrappedNode: ComponentType<NodeProps>
): ComponentType<NodeProps> {
  function MonitorNodeWrapper(props: NodeProps) {
    const status: MonitorNodeStatus =
      (props.data as any)?.__monitorStatus || "idle"
    const isSelected = (props.data as any)?.__isSelected || false

    const ringClass = STATUS_RING[status]
    const badge = STATUS_BADGE[status]

    return (
      <div className={`relative rounded-lg ${ringClass} ${isSelected ? "ring-offset-2 ring-offset-background" : ""}`}>
        {badge && (
          <div
            className={`absolute -top-2.5 -right-2.5 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${badge.className}`}
          >
            {badge.label}
          </div>
        )}
        <WrappedNode {...props} />
      </div>
    )
  }

  MonitorNodeWrapper.displayName = `Monitor(${WrappedNode.displayName || WrappedNode.name || "Node"})`
  return MonitorNodeWrapper
}
