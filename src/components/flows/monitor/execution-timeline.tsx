"use client"

import { useRef, useEffect } from "react"
import { useFlowMonitorStore } from "@/stores/flow-monitor-store"

interface LogEntry {
  _id: string
  nodeId: string
  nodeType: string
  action: string
  output?: string | null
  timestamp: number
}

const ACTION_COLORS: Record<string, string> = {
  entered: "bg-blue-500",
  executed: "bg-emerald-500",
  exited: "bg-green-500",
  error: "bg-red-500",
  skipped: "bg-gray-400",
  paused: "bg-amber-500",
  resumed: "bg-blue-400",
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function truncateOutput(output: string | null | undefined, max = 80): string {
  if (!output) return ""
  try {
    const parsed = JSON.parse(output)
    const str = JSON.stringify(parsed)
    return str.length > max ? str.slice(0, max) + "..." : str
  } catch {
    return output.length > max ? output.slice(0, max) + "..." : output
  }
}

export function ExecutionTimeline({ logs }: { logs: LogEntry[] | undefined }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { selectLogNode, selectedLogNodeId } = useFlowMonitorStore()

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs?.length])

  if (!logs || logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No execution logs yet
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2">
      <div className="space-y-1.5">
        {logs.map((log) => {
          const dotColor = ACTION_COLORS[log.action] || "bg-gray-300"
          const isSelected = selectedLogNodeId === log.nodeId

          return (
            <button
              key={log._id}
              type="button"
              onClick={() => selectLogNode(log.nodeId)}
              className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50 ${
                isSelected ? "bg-muted" : ""
              }`}
            >
              {/* Status dot */}
              <div className="mt-1.5 flex-shrink-0">
                <div className={`size-2 rounded-full ${dotColor}`} />
              </div>

              <div className="min-w-0 flex-1">
                {/* Node name + action badge */}
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium">
                    {log.nodeId}
                  </span>
                  <span
                    className={`inline-flex flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-medium text-white ${dotColor}`}
                  >
                    {log.action}
                  </span>
                </div>

                {/* Output preview */}
                {log.output && (
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {truncateOutput(log.output)}
                  </p>
                )}
              </div>

              {/* Timestamp */}
              <span className="flex-shrink-0 text-[10px] text-muted-foreground/70">
                {formatTime(log.timestamp)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
