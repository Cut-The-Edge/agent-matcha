"use client"

import { CallMetricsCards } from "@/components/calls/call-metrics-cards"
import { CallLogTable } from "@/components/calls/call-log-table"
import { LiveCallIndicator } from "@/components/calls/live-call-indicator"
import { OutboundCallDialog } from "@/components/calls/outbound-call-dialog"

export default function CallsPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="page-heading">Phone Calls</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor and manage AI voice agent calls.
          </p>
        </div>
        <OutboundCallDialog />
      </div>

      <LiveCallIndicator />
      <CallMetricsCards />

      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
        <CallLogTable />
      </div>
    </div>
  )
}
