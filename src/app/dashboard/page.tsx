"use client"

import { SectionCards } from "@/components/dashboard/section-cards"
import { MatchActivityChart } from "@/components/dashboard/match-activity-chart"
import { RecentActivity } from "@/components/dashboard/recent-activity"

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your CRM at a glance — members, messages, calls, and leads.
        </p>
      </div>
      <SectionCards />
      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "200ms" }}>
        <MatchActivityChart />
      </div>
      <RecentActivity />
    </div>
  )
}
