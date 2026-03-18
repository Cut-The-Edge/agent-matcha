"use client"

import { RecalibrationList } from "@/components/recalibration/recalibration-list"

export default function RecalibrationPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Recalibration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Members who&apos;ve declined 3+ matches and need a recalibration call.
        </p>
      </div>
      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <RecalibrationList />
      </div>
    </div>
  )
}
