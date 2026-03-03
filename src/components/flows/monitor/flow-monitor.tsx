"use client"

import { useState } from "react"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { useNodeStatuses } from "@/hooks/use-node-statuses"
import { MonitorDiagram } from "./monitor-diagram"
import { ExecutionTimeline } from "./execution-timeline"
import { MessageFeed } from "./message-feed"
import { ContextInspector } from "./context-inspector"
import { ArrowLeft, Activity, MessageSquare, Braces } from "lucide-react"
import Link from "next/link"

type Tab = "timeline" | "messages" | "context"

const TABS: { key: Tab; label: string; icon: typeof Activity }[] = [
  { key: "timeline", label: "Timeline", icon: Activity },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "context", label: "Context", icon: Braces },
]

const STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-700",
  error: "bg-red-100 text-red-700",
}

function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function FlowMonitor({ instanceId }: { instanceId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("timeline")

  const data = useQuery(api.engine.monitor.getFlowInstanceWithDefinition, {
    flowInstanceId: instanceId as Id<"flowInstances">,
  })

  const logs = useQuery(api.engine.monitor.getExecutionLogsAsc, {
    instanceId: instanceId as Id<"flowInstances">,
  })

  const messages = useQuery(api.engine.monitor.getWhatsAppMessagesByInstance, {
    instanceId: instanceId as Id<"flowInstances">,
  })

  const { nodeStatuses, traversedEdges } = useNodeStatuses(
    logs,
    data?.instance?.currentNodeId,
    data?.instance?.status
  )

  if (data === undefined) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading flow instance...</div>
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Flow instance not found</p>
        <Link
          href="/dashboard/sandbox"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to Sandbox
        </Link>
      </div>
    )
  }

  const { instance, flowDefinition, member } = data
  const context = instance.context as any

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <Link
          href="/dashboard/sandbox"
          className="rounded-md p-1 hover:bg-muted"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {flowDefinition?.name || "Flow"}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[instance.status] || "bg-gray-100 text-gray-700"}`}
            >
              {instance.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {member && (
              <span>
                {member.firstName} {member.lastName || ""}
              </span>
            )}
            <span>Node: {instance.currentNodeId}</span>
            <span>Elapsed: {formatElapsed(instance.startedAt)}</span>
          </div>
        </div>
      </div>

      {/* Main layout: Diagram + Side Panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Diagram — 65% */}
        <div className="w-[65%] border-r border-border">
          {flowDefinition ? (
            <MonitorDiagram
              definitionNodes={flowDefinition.nodes}
              definitionEdges={flowDefinition.edges}
              nodeStatuses={nodeStatuses}
              traversedEdges={traversedEdges}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Flow definition not found
            </div>
          )}
        </div>

        {/* Side Panel — 35% */}
        <div className="flex w-[35%] flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-border">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "timeline" && <ExecutionTimeline logs={logs} />}
            {activeTab === "messages" && <MessageFeed messages={messages} />}
            {activeTab === "context" && (
              <ContextInspector
                context={context}
                instanceStatus={instance.status}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
