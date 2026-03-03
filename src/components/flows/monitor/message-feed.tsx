"use client"

import { useRef, useEffect } from "react"

interface WhatsAppMessage {
  _id: string
  direction: "inbound" | "outbound"
  messageType: string
  content: string
  status: string
  createdAt: number
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

const STATUS_ICONS: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
}

function parseInteractiveContent(content: string): React.ReactNode {
  try {
    const parsed = JSON.parse(content)
    if (parsed.body) {
      return (
        <div>
          <p className="text-sm">{parsed.body}</p>
          {parsed.action?.buttons && (
            <div className="mt-2 space-y-1">
              {parsed.action.buttons.map((btn: any, i: number) => (
                <div
                  key={i}
                  className="rounded border border-white/20 px-2 py-1 text-xs"
                >
                  {i + 1}. {btn.reply?.title || btn.title || "Option"}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    return <p className="text-sm">{content}</p>
  } catch {
    return <p className="text-sm whitespace-pre-wrap">{content}</p>
  }
}

export function MessageFeed({
  messages,
}: {
  messages: WhatsAppMessage[] | undefined
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages?.length])

  if (!messages || messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No messages yet
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2">
      <div className="space-y-3">
        {messages.map((msg) => {
          const isOutbound = msg.direction === "outbound"

          return (
            <div
              key={msg._id}
              className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 ${
                  isOutbound
                    ? "bg-blue-600 text-white"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.messageType === "interactive"
                  ? parseInteractiveContent(msg.content)
                  : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                }
                <div
                  className={`mt-1 flex items-center gap-1 text-[10px] ${
                    isOutbound ? "text-blue-200" : "text-muted-foreground"
                  }`}
                >
                  <span>{formatTime(msg.createdAt)}</span>
                  {isOutbound && (
                    <>
                      <span>·</span>
                      <span
                        className={msg.status === "failed" ? "text-red-300 font-medium" : ""}
                      >
                        {STATUS_ICONS[msg.status] || msg.status}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
