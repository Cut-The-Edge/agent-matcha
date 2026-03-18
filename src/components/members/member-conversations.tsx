"use client"

import { useRouter } from "next/navigation"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  MessageCircle,
  PhoneCall,
  MessageSquareText,
  ArrowRight,
  Inbox,
  Phone,
  Loader2,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import type { Doc, Id } from "../../../convex/_generated/dataModel"

interface MemberConversationsProps {
  member: Doc<"members"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MemberConversations({ member, open, onOpenChange }: MemberConversationsProps) {
  const router = useRouter()

  const data = useAuthQuery(
    api.conversations.queries.getMemberConversationActivity,
    member ? { memberId: member._id } : "skip"
  )

  const memberName = member
    ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
    : ""

  const handleViewWhatsApp = () => {
    if (!member) return
    router.push(`/dashboard/conversations?memberId=${member._id}&channel=whatsapp`)
    onOpenChange(false)
  }

  const handleViewCalls = () => {
    if (!member) return
    router.push(`/dashboard/conversations?memberId=${member._id}&channel=phone`)
    onOpenChange(false)
  }

  const handleViewConversation = (activity: { type: string }) => {
    if (!member) return
    if (activity.type === "phone") {
      router.push(`/dashboard/conversations?memberId=${member._id}&channel=phone`)
    } else {
      router.push(`/dashboard/conversations?memberId=${member._id}`)
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{memberName} — Activity</SheetTitle>
          <SheetDescription>
            WhatsApp messages and phone calls
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {/* Quick action links */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-auto py-2.5"
              onClick={handleViewWhatsApp}
            >
              <MessageCircle className="mr-1.5 size-3.5" />
              <span className="text-xs">WhatsApp Messages</span>
              {data && (
                <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
                  {data.totalWhatsAppMessages}
                </Badge>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-auto py-2.5"
              onClick={handleViewCalls}
            >
              <Phone className="mr-1.5 size-3.5" />
              <span className="text-xs">Call History</span>
              {data && (
                <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5">
                  {data.totalPhoneCalls}
                </Badge>
              )}
            </Button>
          </div>

          {/* Loading state */}
          {data === undefined && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}

          {/* Empty state */}
          {data && data.activities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Inbox className="size-10 opacity-50" />
              <div className="text-center">
                <p className="text-sm font-medium">No conversations yet</p>
                <p className="text-xs mt-1">
                  Conversations will appear here when {member?.firstName || "this member"} receives messages or calls.
                </p>
              </div>
            </div>
          )}

          {/* Activity list */}
          {data && data.activities.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {data.activities.map((activity: any) => (
                <button
                  key={activity._id}
                  className="w-full text-left rounded-md border px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors space-y-1"
                  onClick={() => handleViewConversation(activity)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {activity.type === "whatsapp" ? (
                        <Badge
                          variant="outline"
                          className="h-5 text-[10px] px-1.5 gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                        >
                          <MessageCircle className="size-3" />
                          WhatsApp
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="h-5 text-[10px] px-1.5 gap-1 bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800"
                        >
                          <PhoneCall className="size-3" />
                          Phone
                        </Badge>
                      )}
                      <StatusBadge status={activity.status} type={activity.type} />
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDistanceToNow(activity.date, { addSuffix: true })}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground truncate">
                    {activity.preview}
                  </p>

                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{format(new Date(activity.date), "MMM d, yyyy 'at' HH:mm")}</span>
                    {activity.type === "whatsapp" && activity.messageCount && (
                      <Badge variant="secondary" className="h-4 text-[9px] px-1">
                        <MessageSquareText className="size-2.5 mr-0.5" />
                        {activity.messageCount} msgs
                      </Badge>
                    )}
                    {activity.type === "phone" && activity.duration != null && (
                      <Badge variant="secondary" className="h-4 text-[9px] px-1">
                        {Math.floor(activity.duration / 60)}m {activity.duration % 60}s
                      </Badge>
                    )}
                    <ArrowRight className="size-3 ml-auto" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function StatusBadge({ status, type }: { status: string; type: string }) {
  if (type === "phone") {
    switch (status) {
      case "completed":
        return (
          <Badge variant="outline" className="h-4 text-[9px] px-1 text-muted-foreground">
            Completed
          </Badge>
        )
      case "in_progress":
        return (
          <Badge variant="outline" className="h-4 text-[9px] px-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200">
            In Progress
          </Badge>
        )
      case "transferred":
        return (
          <Badge variant="outline" className="h-4 text-[9px] px-1 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200">
            Transferred
          </Badge>
        )
      case "failed":
      case "no_answer":
        return (
          <Badge variant="destructive" className="h-4 text-[9px] px-1">
            {status === "no_answer" ? "No Answer" : "Failed"}
          </Badge>
        )
      default:
        return null
    }
  }

  // WhatsApp statuses
  switch (status) {
    case "read":
      return (
        <Badge variant="outline" className="h-4 text-[9px] px-1 text-muted-foreground">
          Read
        </Badge>
      )
    case "delivered":
      return (
        <Badge variant="outline" className="h-4 text-[9px] px-1 text-muted-foreground">
          Delivered
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive" className="h-4 text-[9px] px-1">
          Failed
        </Badge>
      )
    default:
      return null
  }
}
