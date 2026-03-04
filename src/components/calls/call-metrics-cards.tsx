"use client"

import {
  Phone,
  UserPlus,
  UserCheck,
  ArrowRightLeft,
  Clock,
  RefreshCw,
} from "lucide-react"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

interface MetricCardProps {
  title: string
  value: string | number
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
}

function MetricCard({ title, value, subtitle, icon: Icon }: MetricCardProps) {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
      </CardHeader>
      <CardFooter>
        <div className="text-sm text-muted-foreground">{subtitle}</div>
      </CardFooter>
    </Card>
  )
}

export function CallMetricsCards() {
  const metrics = useAuthQuery(api.voice.queries.getCallMetrics, {})

  if (!metrics) {
    return (
      <div className="grid grid-cols-2 gap-4 px-4 lg:px-6 @xl/main:grid-cols-3 @5xl/main:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="@container/card animate-pulse">
            <CardHeader>
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="mt-2 h-8 w-12 rounded bg-muted" />
            </CardHeader>
            <CardFooter>
              <div className="h-3 w-24 rounded bg-muted" />
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-2 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-3 @5xl/main:grid-cols-6">
      <MetricCard
        title="Calls Today"
        value={metrics.callsToday}
        subtitle={`${metrics.callsThisWeek} this week`}
        icon={Phone}
      />
      <MetricCard
        title="Avg Duration"
        value={formatDuration(metrics.avgDuration)}
        subtitle={`${metrics.totalCalls} total calls`}
        icon={Clock}
      />
      <MetricCard
        title="New Profiles"
        value={metrics.profilesCreated}
        subtitle="Created from calls"
        icon={UserPlus}
      />
      <MetricCard
        title="Updated Profiles"
        value={metrics.profilesUpdated}
        subtitle="Enriched from calls"
        icon={UserCheck}
      />
      <MetricCard
        title="Transfer Rate"
        value={formatPercent(metrics.transferRate)}
        subtitle="Escalated to Dani"
        icon={ArrowRightLeft}
      />
      <MetricCard
        title="SMA Sync"
        value={formatPercent(metrics.smaSyncRate)}
        subtitle="Synced to SmartMatchApp"
        icon={RefreshCw}
      />
    </div>
  )
}
