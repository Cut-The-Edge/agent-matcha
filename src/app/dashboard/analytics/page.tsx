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
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area } from "recharts"
import { Heart, TrendingUp, Clock, Users, BarChart3, PieChartIcon, Activity, Coins, Cpu, Zap, Database, AlertTriangle, CheckCircle2, Phone, MessageSquare, DollarSign, Target } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { api } from "../../../../convex/_generated/api"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { useState, useMemo } from "react"

// ============================================================================
// Static placeholder data (all zeros / empty states) -- Matchmaking tab
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
// Chart configs -- Matchmaking tab
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
// Chart configs -- Token Analytics tab
// ============================================================================

const costTrendConfig = {
  totalCostUsd: { label: "Cost (USD)", color: "hsl(var(--chart-1))" },
  callCount: { label: "API Calls", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig

const modelBreakdownConfig = {
  totalCostUsd: { label: "Cost (USD)", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig

// ============================================================================
// Process type display names
// ============================================================================

const PROCESS_LABELS: Record<string, string> = {
  "voice-intake": "Voice Intake",
  "summarization": "Summarization",
  "whatsapp-feedback": "WhatsApp Feedback",
  "whatsapp-intro": "WhatsApp Intro",
  "whatsapp-personalization": "WhatsApp Personalization",
  "whatsapp-classification": "WhatsApp Classification",
  "whatsapp-followup": "WhatsApp Follow-up",
  "feedback-analysis": "Feedback Analysis",
  "recalibration-analysis": "Recalibration Analysis",
  "other": "Other",
}

// ============================================================================
// Empty state component
// ============================================================================

function ChartEmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-2xl bg-muted/50 p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">No {label} data yet</p>
      <p className="text-xs text-muted-foreground/70 mt-1.5 max-w-[200px]">
        Data will appear here once matches are created
      </p>
    </div>
  )
}

// ============================================================================
// Formatting helpers
// ============================================================================

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00"
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function formatTokenCount(count: number): string {
  if (count === 0) return "0"
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toLocaleString()
}

function formatPricing(centsPerMillion: number): string {
  const dollarsPerMillion = centsPerMillion / 100
  return `$${dollarsPerMillion.toFixed(2)}/1M`
}

// ============================================================================
// Pricing Staleness Badge
// ============================================================================

function PricingStalenessBadge() {
  const staleness = useAuthQuery(api.analytics.pricingSync.getPricingStaleness, {})

  if (!staleness) {
    return null
  }

  if (staleness.status === "unknown") {
    return (
      <Badge variant="destructive" className="ml-2 gap-1">
        <AlertTriangle className="h-3 w-3" />
        Unknown
      </Badge>
    )
  }

  if (staleness.status === "stale") {
    const lastSyncDate = staleness.lastSyncedAt
      ? new Date(staleness.lastSyncedAt).toLocaleDateString()
      : "Never"
    return (
      <Badge variant="outline" className="ml-2 gap-1 border-yellow-500 text-yellow-600">
        <AlertTriangle className="h-3 w-3" />
        Stale (last: {lastSyncDate})
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="ml-2 gap-1 border-green-500 text-green-600">
      <CheckCircle2 className="h-3 w-3" />
      Up to date
    </Badge>
  )
}

// ============================================================================
// Pricing Staleness Alert Banner
// ============================================================================

function PricingStalenessAlert() {
  const staleness = useAuthQuery(api.analytics.pricingSync.getPricingStaleness, {})

  if (!staleness) return null

  if (staleness.status === "stale" && staleness.lastSyncedAt) {
    const lastSyncDate = new Date(staleness.lastSyncedAt).toLocaleDateString()
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Pricing data may be stale</AlertTitle>
        <AlertDescription>
          Model pricing was last synced on {lastSyncDate} (more than 7 days ago).
          Cost calculations may not reflect current provider rates.
        </AlertDescription>
      </Alert>
    )
  }

  if (staleness.status === "unknown") {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>No pricing data</AlertTitle>
        <AlertDescription>
          No model pricing data has been configured. Run the pricing seed mutation to populate default pricing.
        </AlertDescription>
      </Alert>
    )
  }

  return null
}

// ============================================================================
// Client-Facing Usage Summary Panel
// ============================================================================

function UsageSummaryPanel() {
  const clientSummary = useAuthQuery(api.analytics.tokenTracking.getClientUsageSummary, {})

  if (!clientSummary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-4 w-4" />
            Usage Summary
          </CardTitle>
          <CardDescription>Loading usage data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            Loading...
          </div>
        </CardContent>
      </Card>
    )
  }

  const { categories, perOperation, totalMonthCost, projectedMonthlyCost, monthLabel, totalCalls, dayOfMonth, daysInMonth } = clientSummary

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4" />
          Usage Summary -- {monthLabel}
        </CardTitle>
        <CardDescription>
          AI cost breakdown by service category (day {dayOfMonth} of {daysInMonth})
        </CardDescription>
      </CardHeader>
      <CardContent>
        {totalCalls === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <DollarSign className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No usage this month yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Costs will appear here as AI processes are used
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top-level totals */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Total this month</p>
                <p className="text-3xl font-semibold tabular-nums tracking-tight mt-1">{formatCost(totalMonthCost)}</p>
                <p className="text-xs text-muted-foreground mt-1">{totalCalls} API calls</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Projected monthly total</p>
                <p className="text-3xl font-semibold tabular-nums tracking-tight mt-1">{formatCost(projectedMonthlyCost)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Based on {dayOfMonth} day{dayOfMonth !== 1 ? "s" : ""} of usage
                </p>
              </div>
            </div>

            {/* Category breakdown */}
            <div>
              <h4 className="text-sm font-medium mb-3">By Service</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Phone Agent</p>
                    <p className="text-lg font-semibold tabular-nums">{formatCost(categories.phoneAgent.cost)}</p>
                    <p className="text-xs text-muted-foreground">{categories.phoneAgent.calls} calls</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">WhatsApp Bot</p>
                    <p className="text-lg font-semibold tabular-nums">{formatCost(categories.whatsappBot.cost)}</p>
                    <p className="text-xs text-muted-foreground">{categories.whatsappBot.calls} calls</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Cpu className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Other</p>
                    <p className="text-lg font-semibold tabular-nums">{formatCost(categories.other.cost)}</p>
                    <p className="text-xs text-muted-foreground">{categories.other.calls} calls</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-operation averages */}
            <div>
              <h4 className="text-sm font-medium mb-3">Average Cost per Operation</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Intake call</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {perOperation.avgIntakeCall > 0 ? formatCost(perOperation.avgIntakeCall) : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Feedback cycle</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {perOperation.avgFeedbackCycle > 0 ? formatCost(perOperation.avgFeedbackCycle) : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Intro cycle</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {perOperation.avgIntroCycle > 0 ? formatCost(perOperation.avgIntroCycle) : "--"}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Analysis</span>
                  </div>
                  <span className="text-sm font-medium tabular-nums">
                    {perOperation.avgAnalysis > 0 ? formatCost(perOperation.avgAnalysis) : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Token Analytics Tab Content
// ============================================================================

function TokenAnalyticsTab() {
  const [days, setDays] = useState("30")
  const daysNum = parseInt(days)

  const { startDate, endDate } = useMemo(() => {
    const now = Date.now()
    return { startDate: now - daysNum * 24 * 60 * 60 * 1000, endDate: now }
  }, [daysNum])

  const summary = useAuthQuery(api.analytics.tokenTracking.getTokenUsageSummary, {
    startDate,
    endDate,
  })

  const usageByProcess = useAuthQuery(api.analytics.tokenTracking.getUsageByProcessType, {
    startDate,
    endDate,
  })

  const costBreakdown = useAuthQuery(api.analytics.tokenTracking.getCostBreakdown, {
    startDate,
    endDate,
  })

  const dailyTrend = useAuthQuery(api.analytics.tokenTracking.getDailyCostTrend, {
    days: daysNum,
  })

  const pricing = useAuthQuery(api.analytics.pricingSync.getCurrentPricing, {})

  const isLoading = summary === undefined

  // Pie chart colors for process type distribution
  const PIE_COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(210, 70%, 50%)",
    "hsl(280, 70%, 50%)",
    "hsl(340, 70%, 50%)",
    "hsl(30, 70%, 50%)",
    "hsl(160, 70%, 50%)",
  ]

  const processPieData = (usageByProcess ?? []).map((item: { processType: string; totalCostUsd: number }, i: number) => ({
    name: PROCESS_LABELS[item.processType] ?? item.processType,
    value: item.totalCostUsd,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }))

  const processPieConfig: ChartConfig = {}
  for (const item of processPieData) {
    processPieConfig[item.name] = { label: item.name, color: item.fill }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pricing staleness alert */}
      <PricingStalenessAlert />

      {/* Client-facing usage summary */}
      <UsageSummaryPanel />

      {/* Date range selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Time range:</span>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary stat cards */}
      <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums tracking-tight">
              {isLoading ? "--" : formatCost(summary?.totalCostUsd ?? 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Last {daysNum} days
            </p>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums tracking-tight">
              {isLoading ? "--" : formatTokenCount(summary?.totalTokens ?? 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading ? "--" : formatTokenCount(summary?.totalInputTokens ?? 0)} in / {isLoading ? "--" : formatTokenCount(summary?.totalOutputTokens ?? 0)} out
            </p>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums tracking-tight">
              {isLoading ? "--" : (summary?.totalCalls ?? 0).toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading ? "--" : summary?.uniqueProcesses ?? 0} process types
            </p>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums tracking-tight">
              {isLoading ? "--" : `${summary?.avgLatencyMs ?? 0}ms`}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading ? "--" : summary?.uniqueModels ?? 0} models used
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cost trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" />
            Daily Cost Trend
          </CardTitle>
          <CardDescription>
            Cost and API call volume over the last {daysNum} days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!dailyTrend || dailyTrend.every((d: { totalCostUsd: number }) => d.totalCostUsd === 0) ? (
            <ChartEmptyState icon={TrendingUp} label="cost trend" />
          ) : (
            <ChartContainer config={costTrendConfig} className="max-h-[300px]">
              <AreaChart data={dailyTrend} margin={{ left: 12, right: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v: string) => {
                    const d = new Date(v)
                    return `${d.getMonth() + 1}/${d.getDate()}`
                  }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <ChartTooltip
                  content={<ChartTooltipContent
                    formatter={(value: number, name: string) => {
                      if (name === "totalCostUsd") return [`$${Number(value).toFixed(4)}`, "Cost"]
                      return [value, "Calls"]
                    }}
                  />}
                />
                <Area
                  type="monotone"
                  dataKey="totalCostUsd"
                  stroke="var(--color-totalCostUsd)"
                  fill="var(--color-totalCostUsd)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Cost by process type -- pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChartIcon className="h-4 w-4" />
              Cost by Process Type
            </CardTitle>
            <CardDescription>
              Spend distribution across AI processes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {processPieData.length === 0 ? (
              <ChartEmptyState icon={PieChartIcon} label="process cost" />
            ) : (
              <ChartContainer config={processPieConfig} className="mx-auto aspect-square max-h-[300px]">
                <PieChart>
                  <ChartTooltip
                    content={<ChartTooltipContent
                      formatter={(value: number) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                    />}
                  />
                  <Pie
                    data={processPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    strokeWidth={2}
                  >
                    {processPieData.map((entry: { name: string; value: number; fill: string }, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Cost by model -- bar chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Cost by Model
            </CardTitle>
            <CardDescription>
              Spend distribution across LLM models
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!costBreakdown || costBreakdown.length === 0 ? (
              <ChartEmptyState icon={BarChart3} label="model cost" />
            ) : (
              <ChartContainer config={modelBreakdownConfig} className="max-h-[300px]">
                <BarChart
                  data={costBreakdown.map((item: { model: string; totalCostUsd: number; callCount: number }) => ({
                    model: item.model,
                    totalCostUsd: item.totalCostUsd,
                    callCount: item.callCount,
                  }))}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid horizontal={false} />
                  <YAxis
                    dataKey="model"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={150}
                    tick={{ fontSize: 12 }}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent
                      formatter={(value: number) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                    />}
                  />
                  <Bar dataKey="totalCostUsd" fill="var(--color-totalCostUsd)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Usage by process type -- detail table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Usage by Process Type
          </CardTitle>
          <CardDescription>
            Detailed token and cost breakdown per AI process
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!usageByProcess || usageByProcess.length === 0 ? (
            <ChartEmptyState icon={Database} label="usage" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Process</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Input Tokens</TableHead>
                  <TableHead className="text-right">Output Tokens</TableHead>
                  <TableHead className="text-right">Total Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Avg Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usageByProcess.map((item: { processType: string; callCount: number; totalInputTokens: number; totalOutputTokens: number; totalTokens: number; totalCostUsd: number; avgLatencyMs: number }) => (
                  <TableRow key={item.processType}>
                    <TableCell>
                      <Badge variant="outline">
                        {PROCESS_LABELS[item.processType] ?? item.processType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{item.callCount}</TableCell>
                    <TableCell className="text-right">{formatTokenCount(item.totalInputTokens)}</TableCell>
                    <TableCell className="text-right">{formatTokenCount(item.totalOutputTokens)}</TableCell>
                    <TableCell className="text-right">{formatTokenCount(item.totalTokens)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCost(item.totalCostUsd)}</TableCell>
                    <TableCell className="text-right">{item.avgLatencyMs}ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Current pricing table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4" />
            Model Pricing
            <PricingStalenessBadge />
          </CardTitle>
          <CardDescription>
            Current pricing data used for cost calculations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!pricing || pricing.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Coins className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No pricing data configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Run the pricing seed mutation to populate default pricing
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Input Price</TableHead>
                  <TableHead className="text-right">Output Price</TableHead>
                  <TableHead className="text-right">Last Synced</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.map((item: { provider: string; model: string; inputPricePerMillion: number; outputPricePerMillion: number; lastSyncedAt: number }) => (
                  <TableRow key={`${item.provider}-${item.model}`}>
                    <TableCell>
                      <Badge variant="secondary">{item.provider}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.model}</TableCell>
                    <TableCell className="text-right">{formatPricing(item.inputPricePerMillion)}</TableCell>
                    <TableCell className="text-right">{formatPricing(item.outputPricePerMillion)}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {new Date(item.lastSyncedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Analytics</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Matchmaking analytics, AI usage, and cost insights
        </p>
      </div>

      <div className="px-4 lg:px-6">
        <Tabs defaultValue="matchmaking">
          <TabsList>
            <TabsTrigger value="matchmaking">Matchmaking</TabsTrigger>
            <TabsTrigger value="tokens">Token Analytics</TabsTrigger>
          </TabsList>

          {/* Matchmaking Tab */}
          <TabsContent value="matchmaking">
            <div className="flex flex-col gap-5 pt-4">
              {/* Summary stat cards */}
              <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {summaryStats.map((stat) => (
                  <Card key={stat.title} className="card-hover">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {stat.title}
                      </CardTitle>
                      <stat.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold tabular-nums tracking-tight">{stat.value}</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stat.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid gap-5 md:grid-cols-2">
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
                          tickFormatter={(v: number) => `${v}m`}
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
          </TabsContent>

          {/* Token Analytics Tab */}
          <TabsContent value="tokens">
            <div className="pt-4">
              <TokenAnalyticsTab />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
