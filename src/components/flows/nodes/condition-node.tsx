"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { GitMerge } from "lucide-react"

type ConditionNodeData = {
  label: string
  config?: { expression?: string }
}

export function ConditionNode({ data }: NodeProps) {
  const d = data as unknown as ConditionNodeData
  const expression = d.config?.expression || ""

  return (
    <div className="min-w-[200px] rounded-lg border bg-card shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-yellow-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-yellow-500 px-3 py-2 text-white">
        <GitMerge className="size-4" />
        <span className="text-sm font-medium">Condition</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        {expression && (
          <p className="mt-1 text-xs font-mono text-muted-foreground">
            {expression.length > 50
              ? expression.slice(0, 50) + "..."
              : expression}
          </p>
        )}
      </div>
      <div className="relative pb-4">
        <Handle
          type="source"
          position={Position.Bottom}
          id="true"
          style={{ left: "30%" }}
          className="!h-3 !w-3 !border-2 !border-green-500 !bg-white"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="false"
          style={{ left: "70%" }}
          className="!h-3 !w-3 !border-2 !border-red-500 !bg-white"
        />
      </div>
      <div className="flex justify-around border-t px-2 py-1">
        <span className="text-[9px] font-medium text-green-600">True</span>
        <span className="text-[9px] font-medium text-red-600">False</span>
      </div>
    </div>
  )
}
