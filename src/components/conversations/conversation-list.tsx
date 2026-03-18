"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  MessageSquare,
  MessageSquareOff,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Phone,
  MessageCircle,
  PhoneCall,
  Zap,
  CheckCircle2,
  CircleAlert,
  XCircle,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export type ConversationSummary = {
  memberId: string
  memberName: string
  phone: string | null
  totalMessages: number
  inboundCount: number
  outboundCount: number
  failedCount: number
  lastActivityTimestamp: number
  lastMessageTimestamp: number
  lastMessageDirection: "inbound" | "outbound"
  lastMessagePreview: string
  lastMessageStatus: "sent" | "delivered" | "read" | "failed"
  hasErrors: boolean
  conversationStatus: "active" | "completed" | "escalated" | "failed"
  channels: ("whatsapp" | "phone")[]
  phoneCallCount: number
}

type StatusFilter = "all" | "active" | "completed" | "escalated" | "failed"
type ChannelFilter = "all" | "whatsapp" | "phone"

function maskPhone(phone: string | null): string {
  if (!phone) return "Unknown"
  if (phone.length <= 4) return phone
  return `+***${phone.slice(-4)}`
}

function statusBadge(status: ConversationSummary["conversationStatus"]) {
  switch (status) {
    case "active":
      return (
        <Badge variant="default" className="h-5 text-[10px] px-1.5 gap-1 bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-500/15">
          <Zap className="h-3 w-3" />
          Active
        </Badge>
      )
    case "completed":
      return (
        <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1 text-muted-foreground">
          <CheckCircle2 className="h-3 w-3" />
          Done
        </Badge>
      )
    case "escalated":
      return (
        <Badge variant="default" className="h-5 text-[10px] px-1.5 gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-500/15">
          <CircleAlert className="h-3 w-3" />
          Escalated
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive" className="h-5 text-[10px] px-1.5 gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      )
  }
}

function channelIcon(channels: ("whatsapp" | "phone")[]) {
  if (channels.includes("whatsapp") && channels.includes("phone")) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <MessageCircle className="h-3 w-3" />
        <PhoneCall className="h-3 w-3" />
      </div>
    )
  }
  if (channels.includes("phone")) {
    return <PhoneCall className="h-3 w-3 text-muted-foreground" />
  }
  return <MessageCircle className="h-3 w-3 text-muted-foreground" />
}

interface ConversationListProps {
  summaries: ConversationSummary[] | undefined
  selectedMemberId: string | null
  onSelect: (memberId: string) => void
}

export function ConversationList({
  summaries,
  selectedMemberId,
  onSelect,
}: ConversationListProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all")

  const filtered = useMemo(() => {
    if (!summaries) return []
    let result = summaries

    // Text search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (s) =>
          s.memberName.toLowerCase().includes(q) ||
          (s.phone ?? "").includes(q) ||
          s.lastMessagePreview.toLowerCase().includes(q)
      )
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((s) => s.conversationStatus === statusFilter)
    }

    // Channel filter
    if (channelFilter !== "all") {
      result = result.filter((s) => s.channels.includes(channelFilter))
    }

    return result
  }, [summaries, search, statusFilter, channelFilter])

  // Count by status for filter badges
  const statusCounts = useMemo(() => {
    if (!summaries) return { active: 0, completed: 0, escalated: 0, failed: 0 }
    return {
      active: summaries.filter((s) => s.conversationStatus === "active").length,
      completed: summaries.filter((s) => s.conversationStatus === "completed").length,
      escalated: summaries.filter((s) => s.conversationStatus === "escalated").length,
      failed: summaries.filter((s) => s.conversationStatus === "failed").length,
    }
  }, [summaries])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Messages</h2>
          {summaries && (
            <Badge variant="secondary">{summaries.length}</Badge>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">
                Active {statusCounts.active > 0 && `(${statusCounts.active})`}
              </SelectItem>
              <SelectItem value="completed">
                Completed {statusCounts.completed > 0 && `(${statusCounts.completed})`}
              </SelectItem>
              <SelectItem value="escalated">
                Escalated {statusCounts.escalated > 0 && `(${statusCounts.escalated})`}
              </SelectItem>
              <SelectItem value="failed">
                Failed {statusCounts.failed > 0 && `(${statusCounts.failed})`}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={channelFilter}
            onValueChange={(v) => setChannelFilter(v as ChannelFilter)}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        {!summaries && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {summaries && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2 px-6">
            <MessageSquareOff className="h-10 w-10" />
            <p className="text-sm text-center">
              {search || statusFilter !== "all" || channelFilter !== "all"
                ? "No conversations match your filters."
                : "No conversations yet. Conversations will appear when members receive messages."}
            </p>
          </div>
        )}

        {filtered.map((summary) => (
          <ConversationListItem
            key={summary.memberId}
            summary={summary}
            isSelected={selectedMemberId === summary.memberId}
            onClick={() => onSelect(summary.memberId)}
          />
        ))}
      </ScrollArea>
    </div>
  )
}

function ConversationListItem({
  summary,
  isSelected,
  onClick,
}: {
  summary: ConversationSummary
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors ${
        isSelected ? "bg-muted" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Avatar className="h-10 w-10 shrink-0 mt-0.5">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
            {summary.memberName
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          {/* Name + timestamp */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm truncate">
              {summary.memberName}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDistanceToNow(summary.lastActivityTimestamp, {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Phone + channel icons */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <div className="flex items-center gap-1">
              <Phone className="h-3 w-3" />
              <span>{maskPhone(summary.phone)}</span>
            </div>
            {channelIcon(summary.channels)}
          </div>

          {/* Last message preview */}
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {summary.lastMessageDirection === "outbound" ? "Bot: " : ""}
            {summary.lastMessagePreview}
          </p>

          {/* Status badge + message count row */}
          <div className="flex items-center gap-2 mt-1.5">
            {statusBadge(summary.conversationStatus)}
            <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {summary.totalMessages}
            </Badge>
            {summary.phoneCallCount > 0 && (
              <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-0.5">
                <PhoneCall className="h-3 w-3" />
                {summary.phoneCallCount}
              </Badge>
            )}
            {summary.hasErrors && (
              <Badge
                variant="destructive"
                className="h-5 text-[10px] px-1.5 gap-0.5"
              >
                <AlertTriangle className="h-3 w-3" />
                {summary.failedCount}
              </Badge>
            )}
          </div>
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-3" />
      </div>
    </button>
  )
}
