"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, CalendarClock, Star } from "lucide-react"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import type { Doc } from "../../../convex/_generated/dataModel"

// We sort groups by a predefined priority. Since the actual group names come from the SMA API
// (e.g., "Active Introductions", "Automated Intro"), we match by keyword prefix.
const GROUP_PRIORITY: Array<{ keyword: string; className: string }> = [
  { keyword: "active", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { keyword: "potential", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  { keyword: "rejected", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { keyword: "past", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { keyword: "successful", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { keyword: "automated", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  { keyword: "not suitable", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
]

function getGroupPriority(groupName: string): number {
  const lower = groupName.toLowerCase()
  const idx = GROUP_PRIORITY.findIndex((g) => lower.includes(g.keyword))
  return idx === -1 ? GROUP_PRIORITY.length : idx
}

function getGroupBadgeClass(groupName: string): string {
  const lower = groupName.toLowerCase()
  const match = GROUP_PRIORITY.find((g) => lower.includes(g.keyword))
  return match?.className ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
}

interface IntroDetailSheetProps {
  member: Doc<"members"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IntroDetailSheet({ member, open, onOpenChange }: IntroDetailSheetProps) {
  const introductions = useAuthQuery(
    api.members.queries.getIntroductions,
    member?.smaId ? { memberSmaId: member.smaId } : "skip"
  )

  const memberName = member
    ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
    : ""
  const total = member?.smaIntroSummary?.total ?? 0

  // Group introductions by their group name
  const grouped = new Map<string, NonNullable<typeof introductions>>()
  if (introductions) {
    for (const intro of introductions) {
      const list = grouped.get(intro.group) ?? []
      list.push(intro)
      grouped.set(intro.group, list)
    }
  }

  // Sort groups by priority
  const sortedGroups = Array.from(grouped.keys()).sort(
    (a: string, b: string) => getGroupPriority(a) - getGroupPriority(b)
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{memberName} — Introductions</SheetTitle>
          <SheetDescription>{total} total introduction{total !== 1 ? "s" : ""}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-6">
          {introductions === undefined && (
            <p className="text-muted-foreground text-sm">Loading...</p>
          )}

          {introductions && introductions.length === 0 && (
            <p className="text-muted-foreground text-sm">No introductions found.</p>
          )}

          {sortedGroups.map((groupName) => {
            const items = grouped.get(groupName)!
            const badgeClass = getGroupBadgeClass(groupName)
            return (
              <div key={groupName}>
                <div className="mb-2 flex items-center gap-2">
                  <Badge variant="outline" className={`border-transparent text-xs ${badgeClass}`}>
                    {groupName}
                  </Badge>
                  <span className="text-muted-foreground text-xs">({items.length})</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {items.map((intro: any) => (
                    <div
                      key={intro._id}
                      className="rounded-md border px-3 py-2 text-sm space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <a
                          href={`https://club-allenby.smartmatchapp.com/#!/client/${intro.partnerSmaId}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {intro.partnerName || `Client #${intro.partnerSmaId}`}
                          <ExternalLink className="size-3" />
                        </a>
                        <div className="flex items-center gap-2 text-xs">
                          {intro.clientPercent != null && (
                            <span className="tabular-nums text-muted-foreground">{intro.clientPercent}%</span>
                          )}
                        </div>
                      </div>
                      <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        {intro.smaCreatedDate && (
                          <span>{new Date(intro.smaCreatedDate).toLocaleDateString()}</span>
                        )}
                        {intro.matchmakerName && (
                          <span>by {intro.matchmakerName}</span>
                        )}
                      </div>
                      {/* Enriched match detail fields */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {intro.matchStatus && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {intro.matchStatus}
                          </Badge>
                        )}
                        {intro.clientStatus && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Client: {intro.clientStatus}
                          </Badge>
                        )}
                        {intro.matchPartnerStatus && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Partner: {intro.matchPartnerStatus}
                          </Badge>
                        )}
                      </div>
                      {(intro.clientPriority != null || intro.clientDueDate) && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {intro.clientPriority != null && (
                            <span className="inline-flex items-center gap-0.5">
                              <Star className="size-3" />
                              Priority {intro.clientPriority}
                            </span>
                          )}
                          {intro.clientDueDate && (
                            <span className="inline-flex items-center gap-0.5">
                              <CalendarClock className="size-3" />
                              {new Date(intro.clientDueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
