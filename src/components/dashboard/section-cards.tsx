"use client"

import { Heart, Users, Clock, TrendingUp } from "lucide-react"
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

interface StatCardProps {
  title: string
  value: string | number
  description: string
  footer: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  href?: string
}

function StatCard({
  title,
  value,
  description,
  footer,
  icon: Icon,
  badge,
  href,
}: StatCardProps) {
  const router = useRouter()

  return (
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
          {value}
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
}

export function SectionCards() {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <StatCard
        title="Active Matches"
        value={0}
        description="No active matches yet"
        footer="Matches will appear once members are paired"
        icon={Heart}
        href="/dashboard/matches"
      />
      <StatCard
        title="Total Members"
        value={0}
        description="No members yet"
        footer="Add members to start matchmaking"
        icon={Users}
        href="/dashboard/members"
      />
      <StatCard
        title="Pending Responses"
        value={0}
        description="No pending responses"
        footer="Awaiting member replies to matches"
        icon={Clock}
        badge="Clear"
        href="/dashboard/conversations"
      />
      <StatCard
        title="Response Rate"
        value="--"
        description="No data yet"
        footer="Average response rate across all matches"
        icon={TrendingUp}
        href="/dashboard/analytics"
      />
    </div>
  )
}
