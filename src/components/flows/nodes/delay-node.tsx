"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Clock } from "lucide-react"

type DelayNodeData = {
  label: string
  config?: {
    duration?: number
    unit?: string
    reminderTemplate?: string
    timeoutEdgeId?: string
  }
}

export function DelayNode({ data }: NodeProps) {
  const d = data as unknown as DelayNodeData
  const duration = d.config?.duration || 0
  const unit = d.config?.unit || "hours"
  const hasTimeout = !!d.config?.timeoutEdgeId

  return (
    <div className="min-w-[180px] rounded-lg border bg-card shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-teal-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-teal-500 px-3 py-2 text-white">
        <Clock className="size-4" />
        <span className="text-sm font-medium">Delay</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Wait: {duration} {unit}
        </p>
        {d.config?.reminderTemplate && (
          <p className="text-[10px] text-muted-foreground/70">
            Has reminder
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="default"
        className="!h-3 !w-3 !border-2 !border-teal-500 !bg-white"
      />
      {hasTimeout && (
        <Handle
          type="source"
          position={Position.Bottom}
          id="timeout"
          style={{ left: "75%" }}
          className="!h-3 !w-3 !border-2 !border-orange-400 !bg-white"
        />
      )}
    </div>
  )
}
