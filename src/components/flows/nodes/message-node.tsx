"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { MessageSquare } from "lucide-react"

type MessageNodeData = {
  label: string
  config?: { template?: string; channel?: string; mediaUrl?: string }
}

export function MessageNode({ data }: NodeProps) {
  const d = data as unknown as MessageNodeData
  const template = d.config?.template || ""
  const preview = template.length > 50 ? template.slice(0, 50) + "..." : template

  return (
    <div className="min-w-[200px] rounded-lg border bg-card shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-blue-500 px-3 py-2 text-white">
        <MessageSquare className="size-4" />
        <span className="text-sm font-medium">Message</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        {preview && (
          <p className="mt-1 text-xs text-muted-foreground">{preview}</p>
        )}
        {d.config?.channel && (
          <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {d.config.channel}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-blue-500 !bg-white"
      />
    </div>
  )
}
