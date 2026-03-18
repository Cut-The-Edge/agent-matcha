"use client"

import { useRouter } from "next/navigation"
import {
  MessageSquare,
  Phone,
  ArrowRight,
  Activity,
  RefreshCcw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"

function formatTimeAgo(timestamp: number) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

type ActivityItem = {
  type: string
  timestamp: number
  data: Record<string, any>
}

function getActivityLabel(activity: ActivityItem) {
  if (activity.type === "match_update") {
    const { status, memberAName, memberBName } = activity.data
    return `${memberAName} & ${memberBName} — ${status}`
  }
  if (activity.type === "whatsapp_message") {
    const { direction, memberName } = activity.data
    return direction === "inbound"
      ? `Message from ${memberName}`
      : `Message sent to ${memberName}`
  }
  if (activity.type === "phone_call") {
    const { direction, memberName, status } = activity.data
    const dir = direction === "inbound" ? "Inbound" : "Outbound"
    return `${dir} call — ${memberName} (${status})`
  }
  return "Unknown activity"
}

function getActivityIcon(activity: ActivityItem) {
  if (activity.type === "match_update") return RefreshCcw
  if (activity.type === "whatsapp_message") return MessageSquare
  if (activity.type === "phone_call") return Phone
  return Activity
}

export function RecentActivity() {
  const router = useRouter()
  const activities = useAuthQuery(api.analytics.queries.getRecentActivity, {
    limit: 8,
  })

  return (
    <div className="stagger grid gap-5 px-4 lg:grid-cols-2 lg:px-6">
      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            <span className="tracking-tight">Recent Activity</span>
          </CardTitle>
          <CardDescription>Latest events across your CRM</CardDescription>
        </CardHeader>
        <CardContent>
          {activities === undefined ? (
            <div className="flex h-[220px] items-center justify-center text-muted-foreground">
              <p className="text-sm">Loading activity...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="mx-auto mb-4 rounded-2xl bg-muted/50 p-4 w-fit">
                  <Activity className="size-7 opacity-40" />
                </div>
                <p className="text-sm font-medium">No activity yet</p>
                <p className="mt-1.5 text-xs text-muted-foreground/70 max-w-[200px]">
                  Events will appear here as you use the CRM
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {activities.slice(0, 6).map((activity: ActivityItem, i: number) => {
                const Icon = getActivityIcon(activity)
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 hover:bg-muted/50"
                  >
                    <div className="mt-0.5 rounded-md bg-muted/60 p-1.5">
                      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium leading-snug">
                        {getActivityLabel(activity)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/70">
                        {formatTimeAgo(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="tracking-tight">Quick Actions</CardTitle>
          <CardDescription>Jump to common tasks</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3.5 transition-all duration-200 hover:shadow-sm"
                onClick={() => router.push("/dashboard/conversations")}
              >
                <MessageSquare className="size-4 shrink-0 text-primary" />
                <div className="flex flex-1 items-center justify-between">
                  <div className="text-left">
                    <div className="text-sm font-medium">View Messages</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Check WhatsApp conversations
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover/button:translate-x-0.5" />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Open the messages inbox to read and respond to member conversations
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3.5 transition-all duration-200 hover:shadow-sm"
                onClick={() => router.push("/dashboard/calls")}
              >
                <Phone className="size-4 shrink-0 text-accent" />
                <div className="flex flex-1 items-center justify-between">
                  <div className="text-left">
                    <div className="text-sm font-medium">Call Logs</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      View recent voice calls and transcripts
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover/button:translate-x-0.5" />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Browse the call log to review recordings and AI-generated transcripts
            </TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>
    </div>
  )
}
