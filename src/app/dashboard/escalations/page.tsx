"use client"

import { useState } from "react"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../../convex/_generated/api"
import { Id } from "../../../../convex/_generated/dataModel"

const ISSUE_TYPE_LABELS: Record<string, string> = {
  unrecognized_response: "Unrecognized Response",
  special_request: "Special Request",
  upsell_purchase: "Upsell Purchase",
  frustrated_member: "Frustrated Member",
  manual: "Manual",
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-red-100 text-red-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
}

export default function EscalationsPage() {
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "in_progress" | "resolved" | undefined
  >(undefined)

  const escalations = useAuthQuery(api.escalations.queries.list, {
    status: statusFilter,
  })

  const counts = useAuthQuery(api.escalations.queries.getCounts, {})

  const { mutateWithAuth: updateStatusMutation } = useAuthMutation(
    api.escalations.mutations.updateStatus
  )
  const { mutateWithAuth: resolveMutation } = useAuthMutation(
    api.escalations.mutations.resolveEscalation
  )

  const handleResolve = async (escalationId: Id<"escalations">) => {
    await resolveMutation({ escalationId })
  }

  const handleMarkInProgress = async (escalationId: Id<"escalations">) => {
    await updateStatusMutation({ escalationId, status: "in_progress" })
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Escalations</h2>
          <p className="text-muted-foreground">
            Items that need your attention — unrecognized responses, special
            requests, and upsell notifications.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 px-4 sm:grid-cols-3 lg:px-6">
        <button
          onClick={() =>
            setStatusFilter(statusFilter === "pending" ? undefined : "pending")
          }
          className={`rounded-lg border p-4 text-left transition-colors ${
            statusFilter === "pending"
              ? "border-red-300 bg-red-50"
              : "hover:bg-muted/50"
          }`}
        >
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="text-2xl font-bold text-red-600">
            {counts?.pending ?? 0}
          </p>
        </button>
        <button
          onClick={() =>
            setStatusFilter(
              statusFilter === "in_progress" ? undefined : "in_progress"
            )
          }
          className={`rounded-lg border p-4 text-left transition-colors ${
            statusFilter === "in_progress"
              ? "border-yellow-300 bg-yellow-50"
              : "hover:bg-muted/50"
          }`}
        >
          <p className="text-sm text-muted-foreground">In Progress</p>
          <p className="text-2xl font-bold text-yellow-600">
            {counts?.inProgress ?? 0}
          </p>
        </button>
        <button
          onClick={() =>
            setStatusFilter(
              statusFilter === "resolved" ? undefined : "resolved"
            )
          }
          className={`rounded-lg border p-4 text-left transition-colors ${
            statusFilter === "resolved"
              ? "border-green-300 bg-green-50"
              : "hover:bg-muted/50"
          }`}
        >
          <p className="text-sm text-muted-foreground">Resolved</p>
          <p className="text-2xl font-bold text-green-600">
            {counts?.resolved ?? 0}
          </p>
        </button>
      </div>

      {/* Table */}
      <div className="px-4 lg:px-6">
        <div className="rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Member</th>
                  <th className="px-4 py-3 text-left font-medium">Match</th>
                  <th className="px-4 py-3 text-left font-medium">Issue</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Member Message
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {escalations === undefined ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      Loading...
                    </td>
                  </tr>
                ) : escalations.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      {statusFilter
                        ? `No ${statusFilter.replace("_", " ")} escalations`
                        : "No escalations yet"}
                    </td>
                  </tr>
                ) : (
                  escalations.map((esc: any) => (
                    <tr key={esc._id} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[esc.status] || ""
                          }`}
                        >
                          {esc.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium">
                          {ISSUE_TYPE_LABELS[esc.issueType] || esc.issueType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{esc.memberName}</div>
                        {esc.memberPhone && (
                          <div className="text-xs text-muted-foreground">
                            {esc.memberPhone}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {esc.matchContext || "-"}
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        <p className="truncate text-xs">
                          {esc.issueDescription}
                        </p>
                      </td>
                      <td className="max-w-[200px] px-4 py-3">
                        {esc.memberMessage ? (
                          <p className="truncate text-xs italic text-muted-foreground">
                            &quot;{esc.memberMessage}&quot;
                          </p>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {new Date(esc.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        {new Date(esc.createdAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {esc.status === "pending" && (
                            <button
                              onClick={() => handleMarkInProgress(esc._id)}
                              className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 hover:bg-yellow-200"
                            >
                              Start
                            </button>
                          )}
                          {esc.status !== "resolved" && (
                            <button
                              onClick={() => handleResolve(esc._id)}
                              className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-200"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
