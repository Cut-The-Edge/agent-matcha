"use client"

import { useRouter } from "next/navigation"
import {
  Users,
  MessageSquare,
  Phone,
  Plus,
  ArrowRight,
  Activity,
  RefreshCcw,
  UserPlus,
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
  if (activity.type === "audit_log") {
    const { action, resource } = activity.data
    return `${action} ${resource}`
  }
  if (activity.type === "match_update") {
    const { status, memberAName, memberBName } = activity.data
    return `${memberAName} & ${memberBName} — ${status}`
  }
  return "Unknown activity"
}

function getActivityIcon(activity: ActivityItem) {
  if (activity.type === "match_update") return RefreshCcw
  return Activity
}

export function RecentActivity() {
  const router = useRouter()
  const activities = useAuthQuery(api.analytics.queries.getRecentActivity, {
    limit: 8,
  })

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest events across your CRM</CardDescription>
        </CardHeader>
        <CardContent>
          {activities === undefined ? (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              <p className="text-sm">Loading activity...</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Activity className="mx-auto mb-3 size-8 opacity-40" />
                <p className="text-sm font-medium">No activity yet</p>
                <p className="mt-1 text-xs">
                  Events will appear here as you use the CRM
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 6).map((activity: ActivityItem, i: number) => {
                const Icon = getActivityIcon(activity)
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-md p-2 text-sm transition-colors hover:bg-muted/50"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">
                        {getActivityLabel(activity)}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Jump to common tasks</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3"
                onClick={() => router.push("/dashboard/members")}
              >
                <Plus className="size-4 shrink-0 text-primary" />
                <div className="flex flex-1 items-center justify-between">
                  <div className="text-left">
                    <div className="text-sm font-medium">Add Member</div>
                    <div className="text-xs text-muted-foreground">
                      Register a new community member
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Open the members page to add a new person to your community
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3"
                onClick={() => router.push("/dashboard/leads")}
              >
                <UserPlus className="size-4 shrink-0 text-accent" />
                <div className="flex flex-1 items-center justify-between">
                  <div className="text-left">
                    <div className="text-sm font-medium">Review Leads</div>
                    <div className="text-xs text-muted-foreground">
                      Approve or deny membership upgrades
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              Check if there are any pending membership requests to review
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                className="h-auto justify-start gap-3 px-4 py-3"
                onClick={() => router.push("/dashboard/conversations")}
              >
                <MessageSquare className="size-4 shrink-0 text-primary" />
                <div className="flex flex-1 items-center justify-between">
                  <div className="text-left">
                    <div className="text-sm font-medium">View Messages</div>
                    <div className="text-xs text-muted-foreground">
                      Check WhatsApp conversations
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
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
                className="h-auto justify-start gap-3 px-4 py-3"
                onClick={() => router.push("/dashboard/calls")}
              >
                <Phone className="size-4 shrink-0 text-accent" />
                <div className="flex flex-1 items-center justify-between">
                  <div className="text-left">
                    <div className="text-sm font-medium">Call Logs</div>
                    <div className="text-xs text-muted-foreground">
                      View recent voice calls and transcripts
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground" />
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
