"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

interface FlowContext {
  responses?: Record<string, any>
  feedbackCategories?: string[]
  feedbackFreeText?: string
  memberDecision?: string
  waitingForInput?: boolean
  waitingNodeId?: string
  timestamps?: Record<string, number>
  rejectionCount?: number
  paymentReceived?: boolean
  consentGiven?: boolean
  metadata?: Record<string, any>
}

function Badge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}>
      <span className="text-muted-foreground">{label}:</span>
      <span>{value}</span>
    </div>
  )
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  )
}

function JsonBlock({ data }: { data: any }) {
  if (!data || (typeof data === "object" && Object.keys(data).length === 0)) {
    return <span className="text-[10px] text-muted-foreground/50">empty</span>
  }

  return (
    <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-[10px] leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

export function ContextInspector({
  context,
  instanceStatus,
}: {
  context: FlowContext | undefined | null
  instanceStatus: string | undefined
}) {
  if (!context) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No context available
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Key badges at top */}
      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {instanceStatus && (
          <Badge
            label="Status"
            value={instanceStatus}
            color={
              instanceStatus === "active"
                ? "bg-blue-100 text-blue-700"
                : instanceStatus === "completed"
                  ? "bg-green-100 text-green-700"
                  : instanceStatus === "error"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
            }
          />
        )}
        {context.memberDecision && (
          <Badge
            label="Decision"
            value={context.memberDecision}
            color={
              context.memberDecision === "interested"
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }
          />
        )}
        {context.waitingForInput !== undefined && (
          <Badge
            label="Waiting"
            value={String(context.waitingForInput)}
            color={context.waitingForInput ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}
          />
        )}
        {context.paymentReceived !== undefined && (
          <Badge
            label="Payment"
            value={context.paymentReceived ? "received" : "pending"}
            color={context.paymentReceived ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}
          />
        )}
      </div>

      {/* Collapsible sections */}
      <CollapsibleSection title="Responses" defaultOpen>
        <JsonBlock data={context.responses} />
      </CollapsibleSection>

      <CollapsibleSection title="Feedback Categories">
        {context.feedbackCategories && context.feedbackCategories.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {context.feedbackCategories.map((cat) => (
              <span
                key={cat}
                className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] text-purple-700"
              >
                {cat}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">none</span>
        )}
        {context.feedbackFreeText && (
          <p className="mt-1 text-xs text-muted-foreground">
            &quot;{context.feedbackFreeText}&quot;
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Timestamps">
        <JsonBlock data={context.timestamps} />
      </CollapsibleSection>

      <CollapsibleSection title="Metadata">
        <JsonBlock data={context.metadata} />
      </CollapsibleSection>
    </div>
  )
}
