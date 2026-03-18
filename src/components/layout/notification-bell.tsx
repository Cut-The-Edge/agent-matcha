"use client"

import { useRouter } from "next/navigation"
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import { Id } from "../../../convex/_generated/dataModel"
import { useState } from "react"

interface Notification {
  _id: Id<"notifications">
  type: "escalation" | "lead" | "flow_action" | "system"
  title: string
  message: string
  severity: "info" | "warning" | "urgent"
  read: boolean
  actionUrl?: string
  relatedEntityType?: "escalation" | "membershipLead" | "flowInstance" | "phoneCall"
  relatedEntityId?: string
  createdAt: number
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function SeverityIcon({ severity }: { severity: "info" | "warning" | "urgent" }) {
  switch (severity) {
    case "urgent":
      return <AlertTriangle className="size-4 shrink-0 text-red-500" />
    case "warning":
      return <AlertCircle className="size-4 shrink-0 text-amber-500" />
    case "info":
    default:
      return <Info className="size-4 shrink-0 text-blue-500" />
  }
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const notifications = useAuthQuery(api.notifications.queries.listRecent, {})
  const unreadCount = useAuthQuery(api.notifications.queries.countUnread, {})
  const { mutateWithAuth: markRead } = useAuthMutation(
    api.notifications.mutations.markRead
  )
  const { mutateWithAuth: markAllRead } = useAuthMutation(
    api.notifications.mutations.markAllRead
  )

  const handleNotificationClick = async (
    notificationId: Id<"notifications">,
    actionUrl?: string,
    isRead?: boolean
  ) => {
    if (!isRead) {
      try {
        await markRead({ notificationId })
      } catch (e) {
        console.error("Failed to mark notification as read:", e)
      }
    }
    if (actionUrl) {
      setOpen(false)
      router.push(actionUrl)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await markAllRead({})
    } catch (e) {
      console.error("Failed to mark all as read:", e)
    }
  }

  const displayCount = unreadCount ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-8">
          <Bell className="size-4" />
          {displayCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
              {displayCount > 99 ? "99+" : displayCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {displayCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="size-3" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {!notifications || notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="mb-2 size-8 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {(notifications as Notification[]).map((notification) => (
                <button
                  key={notification._id}
                  onClick={() =>
                    handleNotificationClick(
                      notification._id,
                      notification.actionUrl,
                      notification.read
                    )
                  }
                  className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
                    !notification.read ? "bg-accent/25" : ""
                  }`}
                >
                  <div className="mt-0.5">
                    <SeverityIcon severity={notification.severity} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {notification.title}
                      </span>
                      {!notification.read && (
                        <span className="size-2 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
