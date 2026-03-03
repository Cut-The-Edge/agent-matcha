"use client"

import { Handle, Position, type NodeProps } from "@xyflow/react"
import { GitBranch } from "lucide-react"

type DecisionOption = { value: string; label: string; edgeId: string }

type DecisionNodeData = {
  label: string
  config?: {
    question?: string
    options?: DecisionOption[]
    timeout?: number
    timeoutEdgeId?: string
  }
}

export function DecisionNode({ data }: NodeProps) {
  const d = data as unknown as DecisionNodeData
  const options = d.config?.options || []
  const question = d.config?.question || ""
  const hasTimeout = d.config?.timeout && d.config?.timeoutEdgeId

  return (
    <div className="min-w-[220px] rounded-lg border bg-card shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-amber-500 !bg-white"
      />
      <div className="flex items-center gap-2 rounded-t-lg bg-amber-500 px-3 py-2 text-white">
        <GitBranch className="size-4" />
        <span className="text-sm font-medium">Decision</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs font-medium">{d.label}</p>
        {question && (
          <p className="mt-1 text-xs text-muted-foreground">
            {question.length > 60 ? question.slice(0, 60) + "..." : question}
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          {options.length} option{options.length !== 1 ? "s" : ""}
        </p>
      </div>
      {/* One output handle per option + optional timeout handle */}
      <div className="relative pb-4">
        {options.length > 0 ? (
          options.map((opt, idx) => {
            const total = options.length + (hasTimeout ? 1 : 0)
            const offset = total > 1 ? (idx / (total - 1)) * 80 + 10 : 50
            return (
              <Handle
                key={opt.edgeId || idx}
                type="source"
                position={Position.Bottom}
                id={opt.edgeId || `option-${idx}`}
                style={{ left: `${offset}%` }}
                className="!h-3 !w-3 !border-2 !border-amber-500 !bg-white"
              />
            )
          })
        ) : (
          <Handle
            type="source"
            position={Position.Bottom}
            className="!h-3 !w-3 !border-2 !border-amber-500 !bg-white"
          />
        )}
        {hasTimeout && (
          <Handle
            type="source"
            position={Position.Bottom}
            id="timeout"
            style={{ left: "95%" }}
            className="!h-3 !w-3 !border-2 !border-dashed !border-gray-400 !bg-gray-100"
          />
        )}
      </div>
      {/* Labels under handles */}
      {(options.length > 1 || hasTimeout) && (
        <div className="flex justify-around border-t px-2 py-1">
          {options.map((opt, idx) => (
            <span key={idx} className="text-[9px] text-muted-foreground">
              {opt.label}
            </span>
          ))}
          {hasTimeout && (
            <span className="text-[9px] text-gray-400">
              ⏱ {Math.round((d.config?.timeout || 0) / 3600000)}h
            </span>
          )}
        </div>
      )}
    </div>
  )
}
