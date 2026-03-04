"use client"

import { RecalibrationList } from "@/components/recalibration/recalibration-list"

export default function RecalibrationPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Recalibration</h2>
        <p className="text-muted-foreground">
          Members who&apos;ve declined 3+ matches and need a recalibration call.
        </p>
      </div>
      <div className="px-4 lg:px-6">
        <RecalibrationList />
      </div>
    </div>
  )
}
