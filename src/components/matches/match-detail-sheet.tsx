"use client"

import * as React from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { formatDistanceToNow, format } from "date-fns"
import {
  User,
  Mail,
  Phone,
  Crown,
  ExternalLink,
  Clock,
  MessageSquare,
  GitBranch,
  AlertCircle,
  CheckCircle2,
  Circle,
  Pause,
  XCircle,
  ChevronDown,
  ChevronUp,
  Play,
  LogIn,
  LogOut,
  Zap,
  SkipForward,
  Star,
  CalendarClock,
  Link2,
} from "lucide-react"

// §7.1 Match Status Values
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className:
      "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  rejected: {
    label: "Rejected",
    className:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  },
  past: {
    label: "Past",
    className:
      "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  },
  pending: {
    label: "Pending",
    className:
      "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
  },
  completed: {
    label: "Completed",
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  expired: {
    label: "Expired",
    className:
      "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  },
}

const FLOW_STATUS_ICON: Record<string, React.ReactNode> = {
  active: <Circle className="size-3.5 fill-blue-500 text-blue-500" />,
  paused: <Pause className="size-3.5 text-amber-500" />,
  completed: <CheckCircle2 className="size-3.5 text-emerald-500" />,
  expired: <Clock className="size-3.5 text-stone-400" />,
  error: <XCircle className="size-3.5 text-red-500" />,
}

const TIER_CONFIG: Record<string, { label: string; className: string }> = {
  free: { label: "Free", className: "bg-gray-100 text-gray-600" },
  member: { label: "Member", className: "bg-blue-100 text-blue-600" },
  vip: { label: "VIP", className: "bg-amber-100 text-amber-700" },
}

function MemberCard({
  member,
  label,
}: {
  member: {
    _id: Id<"members">
    firstName: string
    lastName?: string
    email?: string
    phone?: string
    tier: string
    status: string
  } | null
  label: string
}) {
  if (!member) {
    return (
      <div className="rounded-lg border border-dashed p-3">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-sm">Unknown member</p>
      </div>
    )
  }

  const tierConfig = TIER_CONFIG[member.tier] ?? TIER_CONFIG.free

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
          {label}
        </p>
        <Badge variant="outline" className={tierConfig.className + " text-[10px] px-1.5 py-0"}>
          {tierConfig.label}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <div className="bg-muted flex size-8 items-center justify-center rounded-full">
          <User className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {member.firstName}
            {member.lastName ? ` ${member.lastName}` : ""}
          </p>
          <p className="text-muted-foreground text-xs capitalize">{member.status}</p>
        </div>
      </div>
      {member.email && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Mail className="size-3" />
          <span>{member.email}</span>
        </div>
      )}
      {member.phone && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="size-3" />
          <span>{member.phone}</span>
        </div>
      )}
    </div>
  )
}

function FeedbackEntry({
  entry,
}: {
  entry: {
    memberName?: string
    decision: string
    categories?: string[]
    subCategories?: Record<string, string>
    freeText?: string
    createdAt: number
  }
}) {
  const decisionLabels: Record<string, { label: string; className: string }> = {
    interested: { label: "Interested", className: "text-emerald-600" },
    not_interested: { label: "Not Interested", className: "text-red-600" },
    passed: { label: "Passed", className: "text-orange-600" },
  }

  const config = decisionLabels[entry.decision] ?? {
    label: entry.decision,
    className: "text-gray-600",
  }

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{entry.memberName ?? "Member"}</span>
        </div>
        <span className="text-muted-foreground text-[10px]">
          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
        </span>
      </div>
      <p className={`text-sm font-medium ${config.className}`}>{config.label}</p>
      {entry.categories && entry.categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.categories.map((cat) => (
            <Badge key={cat} variant="secondary" className="text-[10px] px-1.5 py-0">
              {cat.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      )}
      {entry.subCategories && Object.keys(entry.subCategories).length > 0 && (
        <div className="space-y-0.5">
          {Object.entries(entry.subCategories).map(([key, val]) => (
            <p key={key} className="text-muted-foreground text-xs">
              <span className="font-medium capitalize">{key.replace(/_/g, " ")}:</span> {val}
            </p>
          ))}
        </div>
      )}
      {entry.freeText && (
        <p className="text-muted-foreground text-xs italic">"{entry.freeText}"</p>
      )}
    </div>
  )
}

const LOG_ACTION_ICON: Record<string, React.ReactNode> = {
  entered: <LogIn className="size-3 text-blue-500" />,
  executed: <Zap className="size-3 text-amber-500" />,
  exited: <LogOut className="size-3 text-gray-400" />,
  error: <XCircle className="size-3 text-red-500" />,
  skipped: <SkipForward className="size-3 text-stone-400" />,
}

function ExecutionTimeline({
  instanceId,
}: {
  instanceId: Id<"flowInstances">
}) {
  const logs = useAuthQuery(api.engine.queries.getExecutionLog, {
    instanceId,
  }) as any[] | undefined

  if (!logs) {
    return (
      <div className="space-y-2 pt-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <p className="text-muted-foreground text-xs py-3 text-center">
        No execution logs recorded.
      </p>
    )
  }

  // Logs come desc from the query, reverse to show chronological order
  const chronological = [...logs].reverse()

  return (
    <div className="relative pl-4 pt-2 space-y-0">
      {/* Timeline line */}
      <div className="absolute left-[7px] top-4 bottom-2 w-px bg-border" />

      {chronological.map((log, i) => {
        const icon = LOG_ACTION_ICON[log.action] ?? (
          <Circle className="size-3 text-gray-400" />
        )

        // Try to parse output for meaningful display
        let outputSummary: string | null = null
        if (log.output) {
          try {
            const parsed = JSON.parse(log.output)
            if (parsed.decision) outputSummary = `Decision: ${parsed.decision}`
            else if (parsed.response) outputSummary = `Response: ${parsed.response}`
            else if (parsed.message) outputSummary = parsed.message
            else if (typeof parsed === "string") outputSummary = parsed
          } catch {
            outputSummary = log.output.length > 80 ? log.output.slice(0, 80) + "..." : log.output
          }
        }

        return (
          <div key={log._id ?? i} className="relative flex items-start gap-2.5 pb-3">
            <div className="relative z-10 mt-0.5 flex size-4 items-center justify-center rounded-full bg-background">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium truncate">
                  {log.nodeId.replace(/_/g, " ")}
                </span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                  {log.action}
                </Badge>
                {log.nodeType && (
                  <span className="text-muted-foreground text-[10px] shrink-0">
                    {log.nodeType}
                  </span>
                )}
              </div>
              {outputSummary && (
                <p className="text-muted-foreground text-[11px] mt-0.5 truncate">
                  {outputSummary}
                </p>
              )}
              <p className="text-muted-foreground text-[10px]">
                {format(new Date(log.timestamp), "HH:mm:ss")}
                {log.duration != null && ` · ${log.duration}ms`}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function FlowInstanceCard({
  instance,
}: {
  instance: {
    _id: Id<"flowInstances">
    currentNodeId: string
    status: string
    startedAt: number
    completedAt?: number
    lastTransitionAt: number
    error?: string
    context?: any
    flowDefinition?: { name: string; type: string; version: number } | null
  }
}) {
  const [expanded, setExpanded] = React.useState(false)

  const icon = FLOW_STATUS_ICON[instance.status] ?? (
    <Circle className="size-3.5 text-gray-400" />
  )

  return (
    <div className="rounded-lg border overflow-hidden">
      <button
        type="button"
        className="w-full p-3 text-left space-y-2 hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">
              {instance.flowDefinition?.name ?? "Flow"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-xs capitalize">{instance.status}</span>
            {expanded ? (
              <ChevronUp className="size-3.5 text-muted-foreground ml-1" />
            ) : (
              <ChevronDown className="size-3.5 text-muted-foreground ml-1" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground text-[10px] uppercase tracking-wider">Started</p>
            <p>{format(new Date(instance.startedAt), "MMM d, yyyy HH:mm")}</p>
          </div>
          {instance.completedAt && (
            <div>
              <p className="font-medium text-foreground text-[10px] uppercase tracking-wider">Completed</p>
              <p>{format(new Date(instance.completedAt), "MMM d, yyyy HH:mm")}</p>
            </div>
          )}
          <div>
            <p className="font-medium text-foreground text-[10px] uppercase tracking-wider">Current Node</p>
            <p className="truncate">{instance.currentNodeId.replace(/_/g, " ")}</p>
          </div>
          <div>
            <p className="font-medium text-foreground text-[10px] uppercase tracking-wider">Last Activity</p>
            <p>{formatDistanceToNow(new Date(instance.lastTransitionAt), { addSuffix: true })}</p>
          </div>
        </div>

        {instance.error && (
          <div className="flex items-start gap-1.5 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            <span>{instance.error}</span>
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 pb-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground pt-3 pb-1">
            Execution Timeline
          </p>
          <ExecutionTimeline instanceId={instance._id} />
        </div>
      )}
    </div>
  )
}

// Group priority & colors matching the SMA CRM dashboard
const INTRO_GROUP_CONFIG: Array<{ keyword: string; label: string; className: string }> = [
  { keyword: "successful", label: "Successful Matches", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { keyword: "active", label: "Active Introductions", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { keyword: "potential", label: "Potential Introductions", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { keyword: "rejected", label: "Rejected Introductions", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { keyword: "past", label: "Past Introductions", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { keyword: "automated", label: "Automated Intro", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  { keyword: "not suitable", label: "Not Suitable", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
]

function getIntroGroupConfig(groupName: string) {
  const lower = groupName.toLowerCase()
  return INTRO_GROUP_CONFIG.find((g) => lower.includes(g.keyword))
    ?? { keyword: "", label: groupName, className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" }
}

function getIntroGroupPriority(groupName: string): number {
  const lower = groupName.toLowerCase()
  const idx = INTRO_GROUP_CONFIG.findIndex((g) => lower.includes(g.keyword))
  return idx === -1 ? INTRO_GROUP_CONFIG.length : idx
}

function IntroCard({ intro, isCurrentPartner }: { intro: any; isCurrentPartner: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-sm space-y-1.5 ${isCurrentPartner ? "border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20" : ""}`}>
      <div className="flex items-center justify-between">
        <a
          href={`https://club-allenby.smartmatchapp.com/#!/client/${intro.partnerSmaId}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400 text-xs"
        >
          {intro.partnerName || `Client #${intro.partnerSmaId}`}
          <ExternalLink className="size-2.5" />
        </a>
        <div className="flex items-center gap-1.5">
          {intro.matchStatus && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {intro.matchStatus}
            </Badge>
          )}
          {(intro.clientPercent != null || intro.matchPercent != null) && (
            <span className="tabular-nums text-[10px] text-muted-foreground">
              {intro.clientPercent ?? 0}% / {intro.matchPercent ?? 0}%
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {intro.clientStatus && <span>Client: {intro.clientStatus}</span>}
        {intro.matchPartnerStatus && <span>Partner: {intro.matchPartnerStatus}</span>}
        {intro.clientPriority != null && (
          <span className="inline-flex items-center gap-0.5"><Star className="size-2.5" /> {intro.clientPriority}</span>
        )}
        {intro.clientDueDate && (
          <span className="inline-flex items-center gap-0.5"><CalendarClock className="size-2.5" /> {new Date(intro.clientDueDate).toLocaleDateString()}</span>
        )}
        {intro.matchmakerName && <span>by {intro.matchmakerName}</span>}
        {intro.smaCreatedDate && <span>{new Date(intro.smaCreatedDate).toLocaleDateString()}</span>}
      </div>
    </div>
  )
}

function SmaIntroSection({
  memberSmaId,
  partnerSmaId,
  memberLabel,
}: {
  memberSmaId: string
  partnerSmaId: string
  memberLabel: string
}) {
  const intros = useAuthQuery(
    api.members.queries.getIntroductions,
    { memberSmaId }
  )
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set())

  // Group intros by group name
  const grouped = React.useMemo(() => {
    const map = new Map<string, any[]>()
    if (intros) {
      for (const intro of intros) {
        const list = map.get(intro.group) ?? []
        list.push(intro)
        map.set(intro.group, list)
      }
    }
    return map
  }, [intros])

  // Sort groups by CRM priority order
  const sortedGroups = React.useMemo(
    () => Array.from(grouped.keys()).sort(
      (a, b) => getIntroGroupPriority(a) - getIntroGroupPriority(b)
    ),
    [grouped]
  )

  // Auto-expand groups that contain the current match partner
  React.useEffect(() => {
    const autoExpand = new Set<string>()
    for (const [groupName, items] of grouped) {
      if (items.some((i: any) => i.partnerSmaId === partnerSmaId)) {
        autoExpand.add(groupName)
      }
    }
    if (autoExpand.size > 0) setExpandedGroups(autoExpand)
  }, [grouped, partnerSmaId])

  if (!intros) return <Skeleton className="h-16 w-full" />
  if (intros.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {memberLabel}
        </p>
        <p className="text-xs text-muted-foreground">No introductions</p>
      </div>
    )
  }

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {memberLabel}
      </p>
      {sortedGroups.map((groupName) => {
        const items = grouped.get(groupName)!
        const config = getIntroGroupConfig(groupName)
        const isExpanded = expandedGroups.has(groupName)

        return (
          <div key={groupName} className="rounded-lg border overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/50 transition-colors"
              onClick={() => toggleGroup(groupName)}
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`border-transparent text-[10px] px-1.5 py-0 ${config.className}`}>
                  {groupName}
                </Badge>
                <span className="text-muted-foreground text-[10px]">{items.length}</span>
              </div>
              {isExpanded ? (
                <ChevronUp className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              )}
            </button>
            {isExpanded && (
              <div className="border-t px-2 py-2 space-y-1.5">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-1">No matches</p>
                ) : (
                  items.map((intro: any) => (
                    <IntroCard
                      key={intro._id}
                      intro={intro}
                      isCurrentPartner={intro.partnerSmaId === partnerSmaId}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SheetSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-24" />
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function MatchDetailSheet({
  matchId,
  open,
  onOpenChange,
}: {
  matchId: Id<"matches"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const match = useAuthQuery(
    api.matches.queries.get,
    matchId ? { matchId } : "skip"
  )

  const flowInstances = useAuthQuery(
    api.engine.queries.listFlowInstances,
    matchId ? { matchId } : "skip"
  ) as any[] | undefined

  const feedback = useAuthQuery(
    api.feedback.queries.listByMatch,
    matchId ? { matchId } : "skip"
  ) as any[] | undefined

  const statusConfig = match
    ? STATUS_CONFIG[match.status] ?? { label: match.status, className: "bg-gray-100 text-gray-700" }
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        {!match ? (
          <>
            <SheetHeader>
              <SheetTitle>Match Details</SheetTitle>
              <SheetDescription>Loading...</SheetDescription>
            </SheetHeader>
            <SheetSkeleton />
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {match.memberAName} & {match.memberBName}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <Badge variant="outline" className={statusConfig!.className}>
                  {statusConfig!.label}
                </Badge>
                <span className="text-xs">
                  Created{" "}
                  {formatDistanceToNow(new Date(match.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                {match.responseType && (
                  <>
                    <span className="text-xs">·</span>
                    <span className="text-xs capitalize">
                      {match.responseType.replace(/_/g, " ")}
                    </span>
                  </>
                )}
              </SheetDescription>
            </SheetHeader>

            <div className="px-4 pb-6">
              <Tabs defaultValue="details">
                <TabsList className="w-full">
                  <TabsTrigger value="details" className="flex-1">
                    Details
                  </TabsTrigger>
                  <TabsTrigger value="flows" className="flex-1">
                    Flows
                    {flowInstances && flowInstances.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                        {flowInstances.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="feedback" className="flex-1">
                    Feedback
                    {feedback && feedback.length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                        {feedback.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Details Tab */}
                <TabsContent value="details" className="space-y-4 pt-2">
                  <MemberCard member={match.memberA} label="Member A" />
                  <MemberCard member={match.memberB} label="Member B" />

                  <Separator />

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Match Info
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Triggered By</p>
                        <p className="font-medium">{match.triggeredByName}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Created</p>
                        <p className="font-medium">
                          {format(new Date(match.createdAt), "MMM d, yyyy HH:mm")}
                        </p>
                      </div>
                      {match.smaIntroId && (
                        <div>
                          <p className="text-muted-foreground text-xs">SMA Intro ID</p>
                          <p className="font-medium font-mono text-xs">{match.smaIntroId}</p>
                        </div>
                      )}
                      {match.groupChatId && (
                        <div>
                          <p className="text-muted-foreground text-xs">Group Chat</p>
                          <p className="font-medium font-mono text-xs">{match.groupChatId}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SMA Introduction data — Member A's perspective */}
                  {match.memberA?.smaId && match.memberB?.smaId && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Link2 className="size-3" />
                          SMA Introductions — {match.memberA.firstName}
                        </p>
                        <SmaIntroSection
                          memberSmaId={match.memberA.smaId}
                          partnerSmaId={match.memberB.smaId}
                          memberLabel={`${match.memberA.firstName}'s introductions`}
                        />
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* Flow Runs Tab */}
                <TabsContent value="flows" className="space-y-3 pt-2">
                  {!flowInstances ? (
                    <div className="space-y-3">
                      <Skeleton className="h-24 w-full rounded-lg" />
                      <Skeleton className="h-24 w-full rounded-lg" />
                    </div>
                  ) : flowInstances.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <GitBranch className="size-8 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground text-sm">No flow runs yet</p>
                      <p className="text-muted-foreground text-xs">
                        Flows will appear once a WhatsApp intro is sent.
                      </p>
                    </div>
                  ) : (
                    flowInstances
                      .sort(
                        (a: any, b: any) =>
                          (b.startedAt ?? 0) - (a.startedAt ?? 0)
                      )
                      .map((instance: any) => (
                        <FlowInstanceCard
                          key={instance._id}
                          instance={instance}
                        />
                      ))
                  )}
                </TabsContent>

                {/* Feedback Tab */}
                <TabsContent value="feedback" className="space-y-3 pt-2">
                  {!feedback ? (
                    <div className="space-y-3">
                      <Skeleton className="h-20 w-full rounded-lg" />
                    </div>
                  ) : feedback.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8">
                      <MessageSquare className="size-8 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground text-sm">No feedback yet</p>
                      <p className="text-muted-foreground text-xs">
                        Feedback will appear once a member responds.
                      </p>
                    </div>
                  ) : (
                    feedback
                      .sort((a: any, b: any) => b.createdAt - a.createdAt)
                      .map((entry: any) => (
                        <FeedbackEntry key={entry._id} entry={entry} />
                      ))
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
