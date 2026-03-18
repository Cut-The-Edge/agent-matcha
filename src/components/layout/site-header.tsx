"use client"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/layout/notification-bell"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1.5 px-4 lg:gap-2.5 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-sm font-medium tracking-wide text-foreground/80">Dashboard</h1>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
