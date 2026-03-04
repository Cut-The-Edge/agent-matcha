"use client"

import { CallMetricsCards } from "@/components/calls/call-metrics-cards"
import { CallLogTable } from "@/components/calls/call-log-table"
import { LiveCallIndicator } from "@/components/calls/live-call-indicator"
import { OutboundCallDialog } from "@/components/calls/outbound-call-dialog"

export default function CallsPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Phone Calls</h2>
          <p className="text-muted-foreground">
            Monitor and manage AI voice agent calls.
          </p>
        </div>
        <OutboundCallDialog />
      </div>

      <LiveCallIndicator />
      <CallMetricsCards />

      <div className="px-4 lg:px-6">
        <CallLogTable />
      </div>
    </div>
  )
}
