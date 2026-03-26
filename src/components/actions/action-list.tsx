"use client"

import { useState } from "react"
import { ArrowRight, Clock, Play, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { RecordOutcomeDialog } from "./record-outcome-dialog"
import { toast } from "sonner"

type StatusFilter = "pending" | "in_progress" | "resolved" | undefined

const TYPE_LABELS: Record<string, string> = {
  outreach_needed: "Outreach Needed",
  outreach_pending: "Outreach Pending",
  follow_up_reminder: "Follow-up Reminder",
  payment_pending: "Payment Pending",
  recalibration_due: "Recalibration Due",
  unrecognized_response: "Unrecognized Response",
  frustrated_member: "Frustrated Member",
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  expired: "bg-gray-100 text-gray-600",
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) {
    const mins = Math.floor(diff / (1000 * 60))
    return `${mins}m ago`
  }
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ActionList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(undefined)
  const [outcomeItemId, setOutcomeItemId] = useState<Id<"actionQueue"> | null>(null)

  const items = useAuthQuery(api.actionQueue.queries.list, {
    status: statusFilter,
  })
  const counts = useAuthQuery(api.actionQueue.queries.getCounts, {})
  const { mutateWithAuth: updateStatusMutation } = useAuthMutation(
    api.actionQueue.mutations.updateStatus
  )

  const handleStartWorking = async (id: Id<"actionQueue">) => {
    try {
      await updateStatusMutation({ actionItemId: id, status: "in_progress" })
      toast.success("Item marked as in progress")
    } catch (error: any) {
      toast.error(error?.message || "Failed to update status")
    }
  }

  const handleResolve = async (id: Id<"actionQueue">) => {
    try {
      await updateStatusMutation({ actionItemId: id, status: "resolved" })
      toast.success("Item resolved")
    } catch (error: any) {
      toast.error(error?.message || "Failed to resolve")
    }
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <Tabs
        value={statusFilter ?? "all"}
        onValueChange={(val) =>
          setStatusFilter(val === "all" ? undefined : (val as StatusFilter))
        }
      >
        <TabsList>
          <TabsTrigger value="all">
            All
            {counts && (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {counts.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending
            {counts?.pending ? (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {counts.pending}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="in_progress">
            In Progress
            {counts?.inProgress ? (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {counts.inProgress}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="resolved">
            Resolved
            {counts?.resolved ? (
              <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
                {counts.resolved}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Card list */}
      <div className="space-y-3">
        {items === undefined ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            Loading...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border p-8 text-center text-muted-foreground">
            {statusFilter
              ? `No ${statusFilter.replace("_", " ")} items`
              : "No action items yet"}
          </div>
        ) : (
          items.map((item: any) => (
            <div
              key={item._id}
              className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-muted/30"
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      PRIORITY_STYLES[item.priority] ?? ""
                    }`}
                  >
                    {item.priority}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      STATUS_STYLES[item.status] ?? ""
                    }`}
                  >
                    {item.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
              </div>

              {/* Member → Match Partner */}
              <div className="mt-3 flex items-center gap-2">
                <span className="font-medium">{item.memberName}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">
                  {item.matchPartnerName || "—"}
                </span>
              </div>

              {/* Payment + additional context */}
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {item.paymentAmount && (
                  <span>
                    Paid ${(item.paymentAmount / 100).toFixed(0)} (first half)
                  </span>
                )}
                {item.outreachOutcome && (
                  <span className="font-medium">
                    Outcome: {item.outreachOutcome.replace(/_/g, " ")}
                  </span>
                )}
                {item.followUpDate && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Follow-up:{" "}
                    {new Date(item.followUpDate).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>

              {/* Outreach notes preview */}
              {item.outreachNotes && (
                <p className="mt-2 text-xs italic text-muted-foreground line-clamp-2">
                  &quot;{item.outreachNotes}&quot;
                </p>
              )}

              {/* Action buttons */}
              <div className="mt-3 flex gap-2">
                {item.status === "pending" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs"
                        onClick={() => handleStartWorking(item._id)}
                      >
                        <Play className="h-3 w-3" />
                        Start Working
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Mark this item as in progress so others know you're on it
                    </TooltipContent>
                  </Tooltip>
                )}
                {(item.status === "pending" || item.status === "in_progress") && (
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setOutcomeItemId(item._id)}
                  >
                    Record Outcome
                  </Button>
                )}
                {item.status === "in_progress" && !item.outreachOutcome && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => handleResolve(item._id)}
                  >
                    <CheckCircle className="h-3 w-3" />
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Record Outcome Dialog */}
      <RecordOutcomeDialog
        actionItemId={outcomeItemId}
        onClose={() => setOutcomeItemId(null)}
      />
    </div>
  )
}
