"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts"
import { Heart, TrendingUp, Clock, Users, BarChart3, PieChartIcon, Activity } from "lucide-react"

// ============================================================================
// Static placeholder data (all zeros / empty states)
// ============================================================================

const summaryStats = [
  {
    title: "Total Matches",
    value: "0",
    icon: Heart,
    description: "All time matches created",
  },
  {
    title: "Acceptance Rate",
    value: "--%",
    icon: TrendingUp,
    description: "Mutual interest rate",
  },
  {
    title: "Avg Response Time",
    value: "--",
    icon: Clock,
    description: "Time to first response",
  },
  {
    title: "Active Members",
    value: "0",
    icon: Users,
    description: "Currently active members",
  },
]

// ============================================================================
// Chart configs
// ============================================================================

const outcomeConfig = {
  interested: { label: "Interested", color: "hsl(var(--chart-1))" },
  not_interested: { label: "Not Interested", color: "hsl(var(--chart-2))" },
  passed: { label: "Passed", color: "hsl(var(--chart-3))" },
  expired: { label: "Expired", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig

const feedbackConfig = {
  count: { label: "Count", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig

const responseTimeConfig = {
  avgMinutes: { label: "Avg Minutes", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig

// ============================================================================
// Empty state component
// ============================================================================

function ChartEmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">No {label} data yet</p>
      <p className="text-xs text-muted-foreground mt-1">
        Data will appear here once matches are created
      </p>
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

export default function AnalyticsPage() {
  // In the future, these will come from Convex queries.
  // For now we show empty / zero states.
  const matchOutcomeData: { name: string; value: number; fill: string }[] = []
  const feedbackCategoryData: { category: string; count: number }[] = []
  const responseTimeData: { date: string; avgMinutes: number }[] = []

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-muted-foreground">
          Matchmaking analytics and insights
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        {summaryStats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 px-4 md:grid-cols-2 lg:px-6">
        {/* Match Outcomes Donut Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChartIcon className="h-4 w-4" />
              Match Outcomes
            </CardTitle>
            <CardDescription>
              Distribution of match decisions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {matchOutcomeData.length === 0 ? (
              <ChartEmptyState icon={PieChartIcon} label="match outcome" />
            ) : (
              <ChartContainer config={outcomeConfig} className="mx-auto aspect-square max-h-[300px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={matchOutcomeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    strokeWidth={2}
                  >
                    {matchOutcomeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Feedback Categories Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Feedback Categories
            </CardTitle>
            <CardDescription>
              Reasons members gave for their decisions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {feedbackCategoryData.length === 0 ? (
              <ChartEmptyState icon={BarChart3} label="feedback" />
            ) : (
              <ChartContainer config={feedbackConfig} className="max-h-[300px]">
                <BarChart data={feedbackCategoryData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid horizontal={false} />
                  <YAxis
                    dataKey="category"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                    tick={{ fontSize: 12 }}
                  />
                  <XAxis type="number" hide />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Response Time Trend Line Chart */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Response Time Trend
            </CardTitle>
            <CardDescription>
              Average response time over the last 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {responseTimeData.length === 0 ? (
              <ChartEmptyState icon={Activity} label="response time" />
            ) : (
              <ChartContainer config={responseTimeConfig} className="max-h-[300px]">
                <LineChart data={responseTimeData} margin={{ left: 12, right: 12 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}m`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="avgMinutes"
                    stroke="var(--color-avgMinutes)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
