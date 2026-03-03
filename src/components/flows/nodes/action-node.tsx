"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { Zap } from "lucide-react"

const ACTION_LABELS: Record<string, string> = {
  sync_to_sma: "Sync to SMA",
  notify_admin: "Notify Admin",
  update_match_status: "Update Match Status",
  create_stripe_link: "Create Stripe Link",
  send_introduction: "Send Introduction",
  create_group_chat: "Create Group Chat",
  schedule_recalibration: "Schedule Recalibration",
}

type ActionNodeData = {
  label: string
  config?: { actionType?: string }
}

export function ActionNode({ data }: NodeProps) {
  const d = data as unknown as ActionNodeData
  const actionType = d.config?.actionType || "unknown"

  return (
    <div className="min-w-[200px] rounded-lg border bg-card shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-red-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-red-500 px-3 py-2 text-white">
        <Zap className="size-4" />
        <span className="text-sm font-medium">Action</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
          {ACTION_LABELS[actionType] || actionType}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-red-500 !bg-white"
      />
    </div>
  )
}
