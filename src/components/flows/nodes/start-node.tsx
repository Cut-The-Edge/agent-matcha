"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Play } from "lucide-react"

type StartNodeData = {
  label: string
  config?: { triggerType?: string }
}

export function StartNode({ data }: NodeProps) {
  const d = data as unknown as StartNodeData

  return (
    <div className="min-w-[180px] rounded-lg border bg-card shadow-sm">
      <div className="flex items-center gap-2 rounded-t-lg bg-green-500 px-3 py-2 text-white">
        <Play className="size-4" />
        <span className="text-sm font-medium">Start</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground">{d.label}</p>
        {d.config && (
          <p className="mt-1 text-xs text-muted-foreground/70">
            Trigger: {d.config.triggerType || "manual"}
          </p>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-green-500 !bg-white"
      />
    </div>
  )
}
