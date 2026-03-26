"use client"

import { ActionMetricsCards } from "@/components/actions/action-metrics-cards"
import { ActionList } from "@/components/actions/action-list"

export default function ActionsPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="page-heading">Action Queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Outreach tasks, follow-ups, and items needing your attention.
          </p>
        </div>
      </div>

      <ActionMetricsCards />

      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
        <ActionList />
      </div>
    </div>
  )
}
