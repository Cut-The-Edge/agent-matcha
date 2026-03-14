"use client"

import { SectionCards } from "@/components/dashboard/section-cards"
import { MatchActivityChart } from "@/components/dashboard/match-activity-chart"
import { RecentActivity } from "@/components/dashboard/recent-activity"

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Your CRM at a glance — members, messages, calls, and leads.
        </p>
      </div>
      <SectionCards />
      <div className="px-4 lg:px-6">
        <MatchActivityChart />
      </div>
      <RecentActivity />
    </div>
  )
}
