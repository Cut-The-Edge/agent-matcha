"use client"

import { MemberList } from "@/components/members/member-list"

export default function MembersPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Members</h2>
        <p className="text-muted-foreground">
          Manage your matchmaking members synced from SmartMatchApp.
        </p>
      </div>
      <div className="px-4 lg:px-6">
        <MemberList />
      </div>
    </div>
  )
}
