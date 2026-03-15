"use client"

import { DataRequestList } from "@/components/data-requests/data-request-list"

export default function DataRequestsPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Data Requests</h2>
          <p className="text-muted-foreground">
            Send profile completion forms to members with missing data.
          </p>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <DataRequestList />
      </div>
    </div>
  )
}
