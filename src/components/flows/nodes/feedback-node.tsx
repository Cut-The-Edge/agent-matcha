"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { MessageCircle } from "lucide-react"

type FeedbackNodeData = {
  label: string
  config?: { feedbackType?: string; categories?: string[] }
}

export function FeedbackNode({ data }: NodeProps) {
  const d = data as unknown as FeedbackNodeData
  const feedbackType = d.config?.feedbackType || "general"
  const categories = d.config?.categories || []

  return (
    <div className="min-w-[200px] rounded-lg border bg-card shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-purple-500 px-3 py-2 text-white">
        <MessageCircle className="size-4" />
        <span className="text-sm font-medium">Feedback</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Type: {feedbackType}
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          {categories.length} categor{categories.length !== 1 ? "ies" : "y"}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-purple-500 !bg-white"
      />
    </div>
  )
}
