"use client"

import { MemberList } from "@/components/members/member-list"

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your matchmaking members synced from SmartMatchApp.
        </p>
      </div>
      <div className="px-4 lg:px-6 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
        <MemberList />
      </div>
    </div>
  )
}
