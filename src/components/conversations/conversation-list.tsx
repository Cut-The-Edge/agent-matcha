"use client"

import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Search,
  MessageSquare,
  MessageSquareOff,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Phone,
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
  lastMessageTimestamp: number
  lastMessageDirection: "inbound" | "outbound"
  lastMessagePreview: string
  lastMessageStatus: "sent" | "delivered" | "read" | "failed"
  hasErrors: boolean
}

function maskPhone(phone: string | null): string {
  if (!phone) return "Unknown"
  if (phone.length <= 4) return phone
  return `+***${phone.slice(-4)}`
}

function statusDot(status: string) {
  switch (status) {
    case "delivered":
    case "read":
      return "bg-green-500"
    case "sent":
      return "bg-blue-500"
    case "failed":
      return "bg-red-500"
    default:
      return "bg-gray-400"
  }
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

  const filtered = useMemo(() => {
    if (!summaries) return []
    if (!search) return summaries
    const q = search.toLowerCase()
    return summaries.filter(
      (s) =>
        s.memberName.toLowerCase().includes(q) ||
        (s.phone ?? "").includes(q) ||
        s.lastMessagePreview.toLowerCase().includes(q)
    )
  }, [summaries, search])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Conversations</h2>
          {summaries && (
            <Badge variant="secondary">{summaries.length}</Badge>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
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
              {search
                ? "No conversations match your search."
                : "No conversations yet. Conversations will appear when members receive matches."}
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
              {formatDistanceToNow(summary.lastMessageTimestamp, {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Phone */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Phone className="h-3 w-3" />
            <span>{maskPhone(summary.phone)}</span>
          </div>

          {/* Last message preview */}
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {summary.lastMessageDirection === "outbound" ? "Bot: " : ""}
            {summary.lastMessagePreview}
          </p>

          {/* Badges row */}
          <div className="flex items-center gap-2 mt-1.5">
            {/* Status dot */}
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${statusDot(
                summary.lastMessageStatus
              )}`}
            />
            <Badge variant="outline" className="h-5 text-xs px-1.5">
              <MessageSquare className="h-3 w-3 mr-0.5" />
              {summary.totalMessages}
            </Badge>
            {summary.hasErrors && (
              <Badge
                variant="destructive"
                className="h-5 text-xs px-1.5 gap-1"
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
