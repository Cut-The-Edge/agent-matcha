"use client"

import { use } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  Flag,
  RefreshCw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../../../convex/_generated/api"
import { Id } from "../../../../../convex/_generated/dataModel"
import { TranscriptViewer } from "@/components/calls/transcript-viewer"
import { CallQualityFlags } from "@/components/calls/call-quality-flags"
import { toast } from "sonner"

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return "—"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

export default function CallDetailPage({
  params,
}: {
  params: Promise<{ callId: string }>
}) {
  const { callId } = use(params)
  const call = useAuthQuery(api.voice.queries.getCallById, {
    callId: callId as Id<"phoneCalls">,
  })

  const { mutateWithAuth: flagCall } = useAuthMutation(
    api.voice.mutations.flagCall
  )

  const { mutateWithAuth: triggerSync } = useAuthMutation(
    api.voice.mutations.triggerSmaSync
  )

  if (call === undefined) {
    return (
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  if (call === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-muted-foreground">Call not found</p>
        <Link href="/dashboard/calls">
          <Button variant="outline">Back to calls</Button>
        </Link>
      </div>
    )
  }

  async function handleFlag() {
    try {
      await flagCall({
        callId: callId as Id<"phoneCalls">,
        flag: "flagged_for_review",
      })
      toast.success("Call flagged for review")
    } catch {
      toast.error("Failed to flag call")
    }
  }

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/calls">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">
                {call.member
                  ? `${call.member.firstName}${call.member.lastName ? ` ${call.member.lastName}` : ""}`
                  : call.phone ?? "Unknown Caller"}
              </h2>
              <Badge
                variant={
                  call.status === "completed"
                    ? "secondary"
                    : call.status === "in_progress"
                      ? "default"
                      : "outline"
                }
              >
                {call.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(call.startedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {call.extractedData && call.memberId && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await triggerSync({
                    callId: callId as Id<"phoneCalls">,
                  })
                  toast.success("SMA sync triggered — check Convex logs")
                } catch {
                  toast.error("Failed to trigger sync")
                }
              }}
            >
              <RefreshCw className="mr-2 size-4" />
              Sync CRM
            </Button>
          )}
          <Button variant="outline" onClick={handleFlag}>
            <Flag className="mr-2 size-4" />
            Flag for Review
          </Button>
        </div>
      </div>

      {/* Call info cards */}
      <div className="grid grid-cols-2 gap-4 px-4 lg:grid-cols-4 lg:px-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {call.direction === "inbound" ? (
                <PhoneIncoming className="size-4" />
              ) : (
                <PhoneOutgoing className="size-4" />
              )}
              Direction
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold capitalize">
              {call.direction}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="size-4" />
              Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold tabular-nums">
              {formatDuration(call.duration)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Phone className="size-4" />
              Phone
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {call.phone ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Quality Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CallQualityFlags flags={call.qualityFlags} />
            {(!call.qualityFlags || call.qualityFlags.length === 0) && (
              <p className="text-sm text-muted-foreground">None</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transcript + Summary */}
      <div className="px-4 lg:px-6">
        <TranscriptViewer
          segments={call.segments ?? []}
          aiSummary={call.aiSummary as any}
          extractedData={call.extractedData as Record<string, unknown> | null}
        />
      </div>
    </div>
  )
}
