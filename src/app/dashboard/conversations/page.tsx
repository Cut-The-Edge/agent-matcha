"use client"

import { useState } from "react"
import { Id } from "../../../../convex/_generated/dataModel"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../../convex/_generated/api"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  ConversationList,
  type ConversationSummary,
} from "@/components/conversations/conversation-list"
import {
  MessageThread,
  MessageThreadEmpty,
} from "@/components/conversations/message-thread"

export default function ConversationsPage() {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const isMobile = useIsMobile()

  const summaries = useAuthQuery(
    api.conversations.queries.listConversationSummaries,
    { limit: 200 }
  ) as ConversationSummary[] | undefined

  // Find selected summary for passing member info to thread
  const selectedSummary = summaries?.find(
    (s) => s.memberId === selectedMemberId
  )

  // Mobile: show either list or thread, not both
  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-var(--header-height))] overflow-hidden">
        {selectedMemberId && selectedSummary ? (
          <MessageThread
            memberId={selectedMemberId as Id<"members">}
            memberName={selectedSummary.memberName}
            phone={selectedSummary.phone}
            onClose={() => setSelectedMemberId(null)}
          />
        ) : (
          <ConversationList
            summaries={summaries}
            selectedMemberId={selectedMemberId}
            onSelect={setSelectedMemberId}
          />
        )}
      </div>
    )
  }

  // Desktop: split pane layout
  return (
    <div className="flex h-[calc(100vh-var(--header-height))] overflow-hidden">
      {/* Left panel - Conversation list */}
      <div className="w-80 xl:w-96 border-r shrink-0">
        <ConversationList
          summaries={summaries}
          selectedMemberId={selectedMemberId}
          onSelect={setSelectedMemberId}
        />
      </div>

      {/* Right panel - Message thread */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedMemberId && selectedSummary ? (
          <MessageThread
            memberId={selectedMemberId as Id<"members">}
            memberName={selectedSummary.memberName}
            phone={selectedSummary.phone}
            onClose={() => setSelectedMemberId(null)}
          />
        ) : (
          <MessageThreadEmpty />
        )}
      </div>
    </div>
  )
}
