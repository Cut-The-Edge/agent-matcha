"use client"

import { LeadTable } from "@/components/leads/lead-table"
import { LeadMetricsCards } from "@/components/leads/lead-metrics-cards"

export default function LeadsPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="page-heading">Membership Leads</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and approve membership and VIP interest from voice calls.
          </p>
        </div>
      </div>

      <LeadMetricsCards />

      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
        <LeadTable />
      </div>
    </div>
  )
}
