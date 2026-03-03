"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Square } from "lucide-react"

type EndNodeData = {
  label: string
  config?: { endType?: string }
}

export function EndNode({ data }: NodeProps) {
  const d = data as unknown as EndNodeData
  const endType = d.config?.endType || "completed"

  return (
    <div className="min-w-[160px] rounded-lg border bg-card shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-gray-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-gray-500 px-3 py-2 text-white">
        <Square className="size-4" />
        <span className="text-sm font-medium">End</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
          {endType}
        </span>
      </div>
    </div>
  )
}
