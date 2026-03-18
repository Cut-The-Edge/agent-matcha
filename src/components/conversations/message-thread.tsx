"use client"

import { useEffect, useRef } from "react"
import { Id } from "../../../convex/_generated/dataModel"
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
  Phone,
  PhoneOff,
  Bot,
  User,
  ArrowLeft,
} from "lucide-react"
import { format, isToday, isYesterday } from "date-fns"

// --- Unified event type returned by the updated query ---
type WhatsAppEvent = {
  _id: string
  _type: "whatsapp"
  memberId: string
  direction: "inbound" | "outbound"
  messageType: "text" | "interactive" | "template" | "media"
  content: string
  status: "sent" | "delivered" | "read" | "failed"
  createdAt: number
  twilioSid?: string
  mediaUrl?: string
  mediaContentType?: string
  transcription?: string
  audioDuration?: number
  transcriptionConfidence?: number
  transcriptionSummary?: string
  reviewFlag?: string
  matchId?: string
}

type SystemEvent = {
  _id: string
  _type: "system_event"
  memberId: string
  content: string
  createdAt: number
  eventType: "call_start" | "call_end"
  callId: string
  callStatus: string
  callDirection: string
}

type PhoneTranscriptEvent = {
  _id: string
  _type: "phone_transcript"
  memberId: string
  content: string
  createdAt: number
  speaker: "caller" | "agent"
  callId: string
  confidence?: number
}

type ConversationEvent = WhatsAppEvent | SystemEvent | PhoneTranscriptEvent

// Group events by date for date separators
function groupByDate(events: ConversationEvent[]) {
  const groups: { label: string; events: ConversationEvent[] }[] = []
  let currentLabel = ""

  for (const evt of events) {
    const date = new Date(evt.createdAt)
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
      groups.push({ label, events: [evt] })
    } else {
      groups[groups.length - 1].events.push(evt)
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
  const events = useAuthQuery(api.conversations.queries.listByMember, {
    memberId,
    limit: 200,
  }) as ConversationEvent[] | undefined

  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when events load or change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [events])

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
          <button
            onClick={onClose}
            className="md:hidden text-muted-foreground hover:text-foreground p-1 -ml-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
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
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto bg-muted/30" ref={scrollRef}>
        {!events && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {events && events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">No messages yet</p>
          </div>
        )}

        {events && events.length > 0 && (
          <div className="p-4 space-y-1">
            {groupByDate(events).map((group) => (
              <div key={group.label}>
                {/* Date separator */}
                <div className="flex items-center justify-center my-4">
                  <span className="bg-muted text-muted-foreground text-xs px-3 py-1 rounded-full">
                    {group.label}
                  </span>
                </div>

                {/* Events in this date group */}
                <div className="space-y-1">
                  {group.events.map((evt) => {
                    switch (evt._type) {
                      case "whatsapp":
                        return (
                          <WhatsAppBubble
                            key={evt._id}
                            event={evt}
                            memberName={memberName}
                          />
                        )
                      case "system_event":
                        return (
                          <SystemEventRow key={evt._id} event={evt} />
                        )
                      case "phone_transcript":
                        return (
                          <PhoneTranscriptBubble
                            key={evt._id}
                            event={evt}
                            memberName={memberName}
                          />
                        )
                      default:
                        return null
                    }
                  })}
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

// --- System event (centered muted status message) ---
function SystemEventRow({ event }: { event: SystemEvent }) {
  const isCallStart = event.eventType === "call_start"
  const Icon = isCallStart ? Phone : PhoneOff

  return (
    <div className="flex items-center justify-center my-3">
      <div className="inline-flex items-center gap-2 bg-muted/80 text-muted-foreground text-xs px-4 py-1.5 rounded-full max-w-[85%]">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{event.content}</span>
        <span className="text-[10px] shrink-0 opacity-70">
          {format(new Date(event.createdAt), "HH:mm")}
        </span>
      </div>
    </div>
  )
}

// --- Phone transcript bubble (labeled dialogue: Agent / Member) ---
function PhoneTranscriptBubble({
  event,
  memberName,
}: {
  event: PhoneTranscriptEvent
  memberName: string
}) {
  const isAgent = event.speaker === "agent"

  return (
    <div
      className={`flex ${isAgent ? "justify-start" : "justify-end"} mb-1`}
    >
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${
          isAgent
            ? "bg-violet-50 dark:bg-violet-900/30 text-foreground rounded-bl-sm"
            : "bg-sky-50 dark:bg-sky-900/30 text-foreground rounded-br-sm"
        }`}
      >
        {/* Speaker label */}
        <div className="flex items-center gap-1.5 mb-1">
          {isAgent ? (
            <Bot className="h-3 w-3 text-violet-600 dark:text-violet-400" />
          ) : (
            <User className="h-3 w-3 text-sky-600 dark:text-sky-400" />
          )}
          <span
            className={`text-[10px] font-semibold ${
              isAgent
                ? "text-violet-600 dark:text-violet-400"
                : "text-sky-600 dark:text-sky-400"
            }`}
          >
            {isAgent ? "Agent" : memberName.split(" ")[0]}
          </span>
          <Badge
            variant="outline"
            className="h-4 text-[9px] px-1 border-violet-200 dark:border-violet-800 text-muted-foreground"
          >
            <Phone className="h-2.5 w-2.5 mr-0.5" />
            Call
          </Badge>
        </div>

        {/* Content */}
        <p className="text-sm whitespace-pre-wrap break-words">
          {event.content}
        </p>

        {/* Timestamp + confidence */}
        <div className="flex items-center gap-1 mt-1 justify-start">
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(event.createdAt), "HH:mm:ss")}
          </span>
          {event.confidence !== undefined && event.confidence < 0.8 && (
            <span className="text-[10px] text-amber-500" title="Low confidence transcription">
              ~{Math.round(event.confidence * 100)}%
            </span>
          )}
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

    // Unknown JSON structure -- show raw
    return (
      <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
    )
  } catch {
    // Not valid JSON -- show as plain text
    return (
      <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
    )
  }
}

// --- WhatsApp message bubble (bot on left, member on right) ---
function WhatsAppBubble({
  event,
  memberName,
}: {
  event: WhatsAppEvent
  memberName: string
}) {
  const isOutbound = event.direction === "outbound"

  return (
    <div
      className={`flex ${isOutbound ? "justify-start" : "justify-end"} mb-1`}
    >
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${
          isOutbound
            ? "bg-emerald-100 dark:bg-emerald-900/40 text-foreground rounded-bl-sm"
            : "bg-background text-foreground rounded-br-sm"
        }`}
      >
        {/* Sender label */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {isOutbound ? (
            <Bot className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <User className="h-3 w-3 text-foreground/60" />
          )}
          <span
            className={`text-[10px] font-semibold ${
              isOutbound
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-foreground/60"
            }`}
          >
            {isOutbound ? "Matcha Bot" : memberName.split(" ")[0]}
          </span>
        </div>

        {/* Content */}
        {event.messageType === "interactive" ? (
          <InteractiveContent content={event.content} />
        ) : (
          <>
            {/* Message type label for non-text */}
            {event.messageType !== "text" && (
              <Badge variant="outline" className="mb-1 text-[10px] h-4 px-1">
                {event.messageType}
              </Badge>
            )}
            <p className="text-sm whitespace-pre-wrap break-words">
              {event.content}
            </p>
          </>
        )}

        {/* Voice note transcription */}
        {event.transcription && (
          <div className="mt-1.5 pt-1.5 border-t border-current/10">
            <p className="text-[10px] text-muted-foreground font-medium mb-0.5">
              Transcription
              {event.transcriptionConfidence !== undefined &&
                ` (${Math.round(event.transcriptionConfidence * 100)}%)`}
            </p>
            <p className="text-xs text-muted-foreground italic">
              {event.transcription}
            </p>
          </div>
        )}

        {/* Timestamp + delivery status */}
        <div
          className={`flex items-center gap-1 mt-1 ${
            isOutbound ? "justify-start" : "justify-end"
          }`}
        >
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(event.createdAt), "HH:mm")}
          </span>
          {isOutbound && <DeliveryStatusIcon status={event.status} />}
        </div>

        {/* Failed badge */}
        {event.status === "failed" && (
          <div className="flex items-center gap-1 mt-1 text-red-600 text-xs">
            <AlertTriangle className="h-3 w-3" />
            <span>Failed to deliver</span>
          </div>
        )}
      </div>
    </div>
  )
}
