"use client"

import { useEffect, useRef } from "react"
import { Id, Doc } from "../../../convex/_generated/dataModel"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Check,
  CheckCheck,
  Clock,
  X as XIcon,
  Loader2,
  MessageSquare,
  AlertTriangle,
  Lock,
} from "lucide-react"
import { format, isToday, isYesterday } from "date-fns"

type WhatsAppMessage = Doc<"whatsappMessages">

// Group messages by date for date separators
function groupByDate(messages: WhatsAppMessage[]) {
  const groups: { label: string; messages: WhatsAppMessage[] }[] = []
  let currentLabel = ""

  for (const msg of messages) {
    const date = new Date(msg.createdAt)
    let label: string
    if (isToday(date)) {
      label = "Today"
    } else if (isYesterday(date)) {
      label = "Yesterday"
    } else {
      label = format(date, "MMMM d, yyyy")
    }

    if (label !== currentLabel) {
      currentLabel = label
      groups.push({ label, messages: [msg] })
    } else {
      groups[groups.length - 1].messages.push(msg)
    }
  }

  return groups
}

function DeliveryStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "read":
      return <CheckCheck className="h-3.5 w-3.5 text-blue-500" />
    case "delivered":
      return <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
    case "sent":
      return <Check className="h-3.5 w-3.5 text-muted-foreground" />
    case "failed":
      return <XIcon className="h-3.5 w-3.5 text-red-500" />
    default:
      return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
  }
}

// --- Empty state: nothing selected ---
export function MessageThreadEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <MessageSquare className="h-12 w-12" />
      <p className="text-sm">Select a conversation to view messages</p>
    </div>
  )
}

// --- Main message thread ---
interface MessageThreadProps {
  memberId: Id<"members">
  memberName: string
  phone: string | null
  onClose: () => void
}

export function MessageThread({
  memberId,
  memberName,
  phone,
  onClose,
}: MessageThreadProps) {
  const messages = useAuthQuery(api.conversations.queries.listByMember, {
    memberId,
    limit: 200,
  }) as WhatsAppMessage[] | undefined

  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages load or change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const initials = memberName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-4 md:px-6 py-3 border-b flex items-center justify-between shrink-0 bg-background">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-sm">{memberName}</h2>
            <p className="text-xs text-muted-foreground">
              {phone ? `+***${phone.slice(-4)}` : "No phone"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="md:hidden text-sm text-muted-foreground hover:text-foreground p-1"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto bg-muted/30" ref={scrollRef}>
        {!messages && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {messages && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">No messages yet</p>
          </div>
        )}

        {messages && messages.length > 0 && (
          <div className="p-4 space-y-1">
            {groupByDate(messages).map((group) => (
              <div key={group.label}>
                {/* Date separator */}
                <div className="flex items-center justify-center my-4">
                  <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full">
                    {group.label}
                  </span>
                </div>

                {/* Messages in this date group */}
                <div className="space-y-1">
                  {group.messages.map((msg) => (
                    <MessageBubble key={msg._id} message={msg} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input bar (disabled - bot managed) */}
      <div className="px-4 py-3 border-t bg-background shrink-0">
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            disabled
            placeholder="Bot-managed conversation"
            className="pl-9 bg-muted cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  )
}

// --- Parse interactive message content into WhatsApp-style preview ---
function InteractiveContent({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content)

    // Format: { question: "...", options: [{ value, label }, ...] }
    if (parsed.question) {
      return (
        <div>
          <p className="text-sm whitespace-pre-wrap break-words">
            {parsed.question}
          </p>
          {parsed.options && parsed.options.length > 0 && (
            <div className="mt-2 border-t border-emerald-200 dark:border-emerald-700 pt-2 space-y-1.5">
              {parsed.options.map(
                (opt: { value: string; label: string }, i: number) => (
                  <div
                    key={opt.value || i}
                    className="text-center text-sm text-blue-600 dark:text-blue-400 py-1.5 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-white/50 dark:bg-white/5"
                  >
                    {opt.label}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )
    }

    // Format: { body: "...", action: { buttons: [...] } }
    if (parsed.body) {
      return (
        <div>
          <p className="text-sm whitespace-pre-wrap break-words">
            {parsed.body}
          </p>
          {parsed.action?.buttons && parsed.action.buttons.length > 0 && (
            <div className="mt-2 border-t border-emerald-200 dark:border-emerald-700 pt-2 space-y-1.5">
              {parsed.action.buttons.map((btn: any, i: number) => (
                <div
                  key={i}
                  className="text-center text-sm text-blue-600 dark:text-blue-400 py-1.5 border border-emerald-200 dark:border-emerald-700 rounded-lg bg-white/50 dark:bg-white/5"
                >
                  {btn.reply?.title || btn.title || "Option"}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }

    // Unknown JSON structure — show raw
    return (
      <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
    )
  } catch {
    // Not valid JSON — show as plain text
    return (
      <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
    )
  }
}

// --- Individual message bubble ---
function MessageBubble({ message }: { message: WhatsAppMessage }) {
  const isOutbound = message.direction === "outbound"

  return (
    <div
      className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-1`}
    >
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${
          isOutbound
            ? "bg-emerald-100 dark:bg-emerald-900/40 text-foreground rounded-br-sm"
            : "bg-background text-foreground rounded-bl-sm"
        }`}
      >
        {/* Content */}
        {message.messageType === "interactive" ? (
          <InteractiveContent content={message.content} />
        ) : (
          <>
            {/* Message type label for non-text */}
            {message.messageType !== "text" && (
              <Badge variant="outline" className="mb-1 text-[10px] h-4 px-1">
                {message.messageType}
              </Badge>
            )}
            <p className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </p>
          </>
        )}

        {/* Timestamp + delivery status */}
        <div
          className={`flex items-center gap-1 mt-1 ${
            isOutbound ? "justify-end" : "justify-start"
          }`}
        >
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(message.createdAt), "HH:mm")}
          </span>
          {isOutbound && <DeliveryStatusIcon status={message.status} />}
        </div>

        {/* Failed badge */}
        {message.status === "failed" && (
          <div className="flex items-center gap-1 mt-1 text-red-600 text-xs">
            <AlertTriangle className="h-3 w-3" />
            <span>Failed to deliver</span>
          </div>
        )}
      </div>
    </div>
  )
}
