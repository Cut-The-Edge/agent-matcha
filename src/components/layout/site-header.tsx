"use client"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NotificationBell } from "@/components/layout/notification-bell"
import { useWorkspace, type Workspace } from "@/hooks/use-workspace"
import { Heart, Mic } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs: { id: Workspace; label: string; icon: React.ElementType }[] = [
  { id: "matchmaking", label: "Matchmaking", icon: Heart },
  { id: "interviewer", label: "Interviewer", icon: Mic },
]

export function SiteHeader() {
  const { workspace, setWorkspace } = useWorkspace()

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/50 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1.5 px-4 lg:gap-2.5 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <nav className="flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = workspace === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setWorkspace(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
        </div>
      </div>
    </header>
  )
}
