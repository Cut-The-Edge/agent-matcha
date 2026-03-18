"use client"

import { MatchList } from "@/components/matches/match-list"

export default function MatchesPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Matches</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage member matches.
        </p>
      </div>
      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <MatchList />
      </div>
    </div>
  )
}
