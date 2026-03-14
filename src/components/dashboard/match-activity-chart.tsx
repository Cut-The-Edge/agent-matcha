"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"

const chartConfig = {
  activity: {
    label: "Activity",
    color: "var(--primary)",
  },
  completed: {
    label: "Completed",
    color: "var(--accent)",
  },
} satisfies ChartConfig

export function MatchActivityChart() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("7d")

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("7d")
    }
  }, [isMobile])

  const days = timeRange === "30d" ? 30 : timeRange === "24h" ? 1 : 7
  const trendData = useAuthQuery(api.analytics.queries.getResponseTrend, { days })

  const chartData = trendData ?? []
  const hasData = chartData.some((d: { activity: number; completed: number }) => d.activity > 0 || d.completed > 0)

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case "30d":
        return "last 30 days"
      case "7d":
        return "last 7 days"
      case "24h":
        return "last 24 hours"
      default:
        return "last 7 days"
    }
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <Tooltip>
          <TooltipTrigger asChild>
            <CardTitle className="cursor-help">CRM Activity</CardTitle>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[250px]">
            Shows how active your CRM has been — tracks match updates and completions over time
          </TooltipContent>
        </Tooltip>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Match activity and completions for the {getTimeRangeLabel()}
          </span>
          <span className="@[540px]/card:hidden">
            {timeRange === "30d"
              ? "Last 30 days"
              : timeRange === "7d"
                ? "Last 7 days"
                : "Last 24 hours"}
          </span>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => value && setTimeRange(value)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
            <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
            <ToggleGroupItem value="24h">Last 24 hours</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 7 days" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="30d" className="rounded-lg">
                Last 30 days
              </SelectItem>
              <SelectItem value="7d" className="rounded-lg">
                Last 7 days
              </SelectItem>
              <SelectItem value="24h" className="rounded-lg">
                Last 24 hours
              </SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {!hasData ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg font-medium">No activity yet</p>
              <p className="text-sm">
                Activity will appear here as you use the CRM
              </p>
            </div>
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="fillActivity" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-activity)"
                    stopOpacity={1.0}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-activity)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient
                  id="fillCompleted"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--color-completed)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-completed)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value: string) =>
                      new Date(value).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    }
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="completed"
                type="natural"
                fill="url(#fillCompleted)"
                stroke="var(--color-completed)"
                stackId="a"
              />
              <Area
                dataKey="activity"
                type="natural"
                fill="url(#fillActivity)"
                stroke="var(--color-activity)"
                stackId="a"
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
