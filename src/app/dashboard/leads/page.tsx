"use client"

import { LeadTable } from "@/components/leads/lead-table"
import { LeadMetricsCards } from "@/components/leads/lead-metrics-cards"

export default function LeadsPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Membership Leads</h2>
          <p className="text-muted-foreground">
            Review and approve membership and VIP interest from voice calls.
          </p>
        </div>
      </div>

      <LeadMetricsCards />

      <div className="px-4 lg:px-6">
        <LeadTable />
      </div>
    </div>
  )
}
