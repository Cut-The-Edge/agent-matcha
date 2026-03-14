"use client"

import { Users, UserPlus, MessageSquare, Phone } from "lucide-react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
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

interface StatCardProps {
  title: string
  value: string | number
  description: string
  footer: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  href?: string
  tooltip?: string
  isLoading?: boolean
}

function StatCard({
  title,
  value,
  description,
  footer,
  icon: Icon,
  badge,
  href,
  tooltip,
  isLoading,
}: StatCardProps) {
  const router = useRouter()

  const card = (
    <Card
      className={`@container/card ${href ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}`}
      onClick={href ? () => router.push(href) : undefined}
    >
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {isLoading ? "..." : value}
        </CardTitle>
        {badge && (
          <CardAction>
            <Badge variant="outline">{badge}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {description}
        </div>
        <div className="text-muted-foreground">{footer}</div>
      </CardFooter>
    </Card>
  )

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[250px]">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    )
  }

  return card
}

export function SectionCards() {
  const overviewStats = useAuthQuery(api.analytics.queries.getOverviewStats, {})
  const pendingLeads = useAuthQuery(api.membershipLeads.queries.countPending, {})
  const unreadMessages = useAuthQuery(api.conversations.queries.getUnreadCount, {})
  const callMetrics = useAuthQuery(api.voice.queries.getCallMetrics, {})

  const isLoading = overviewStats === undefined

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <StatCard
        title="Total Members"
        value={overviewStats?.totalMembers ?? 0}
        description={
          overviewStats?.activeMembers
            ? `${overviewStats.activeMembers} active`
            : "No members yet"
        }
        footer="All registered community members"
        icon={Users}
        href="/dashboard/members"
        tooltip="Click to view, search, and manage all your community members"
        isLoading={isLoading}
      />
      <StatCard
        title="Pending Leads"
        value={pendingLeads ?? 0}
        description={
          pendingLeads && pendingLeads > 0
            ? `${pendingLeads} awaiting review`
            : "No pending leads"
        }
        footer="Membership upgrade requests"
        icon={UserPlus}
        href="/dashboard/leads"
        badge={pendingLeads && pendingLeads > 0 ? "Action needed" : undefined}
        tooltip="Click to review and approve membership upgrade requests from leads"
        isLoading={pendingLeads === undefined}
      />
      <StatCard
        title="Unread Messages"
        value={unreadMessages ?? 0}
        description={
          unreadMessages && unreadMessages > 0
            ? `${unreadMessages} unread`
            : "All caught up"
        }
        footer="WhatsApp conversations"
        icon={MessageSquare}
        href="/dashboard/conversations"
        tooltip="Click to view all WhatsApp conversations with your members"
        isLoading={unreadMessages === undefined}
      />
      <StatCard
        title="Calls This Week"
        value={callMetrics?.callsThisWeek?.length ?? callMetrics?.callsThisWeek ?? 0}
        description={
          callMetrics?.totalCalls
            ? `${callMetrics.totalCalls} total calls`
            : "No calls yet"
        }
        footer="Voice call activity"
        icon={Phone}
        href="/dashboard/calls"
        tooltip="Click to view call logs, recordings, and transcripts"
        isLoading={callMetrics === undefined}
      />
    </div>
  )
}
