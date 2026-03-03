"use client"

import { MatchList } from "@/components/matches/match-list"

export default function MatchesPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Matches</h2>
        <p className="text-muted-foreground">
          View and manage member matches.
        </p>
      </div>
      <div className="px-4 lg:px-6">
        <MatchList />
      </div>
    </div>
  )
}
