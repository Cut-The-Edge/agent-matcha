"use client"

import { DataRequestList } from "@/components/data-requests/data-request-list"

export default function DataRequestsPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <div>
          <h2 className="page-heading">Data Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send profile completion forms to members with missing data.
          </p>
        </div>
      </div>

      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <DataRequestList />
      </div>
    </div>
  )
}
