"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Heart,
  Users,
  UserPlus,
  MessageSquare,
  Phone,
  Workflow,
  FlaskConical,
  RefreshCcw,
  BarChart3,
  UserCog,
  Settings,
} from "lucide-react"

import { NavMain } from "@/components/layout/nav-main"
import { NavSecondary } from "@/components/layout/nav-secondary"
import { NavUser } from "@/components/layout/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useCurrentUser } from "@/hooks/use-current-user"

const data = {
  navMain: [
    {
      title: "Overview",
      url: "/dashboard",
      icon: LayoutDashboard,
    },
    {
      title: "Matches",
      url: "/dashboard/matches",
      icon: Heart,
    },
    {
      title: "Members",
      url: "/dashboard/members",
      icon: Users,
    },
    {
      title: "Leads",
      url: "/dashboard/leads",
      icon: UserPlus,
      hasBadge: true,
    },
    {
      title: "Conversations",
      url: "/dashboard/conversations",
      icon: MessageSquare,
    },
    {
      title: "Phone Calls",
      url: "/dashboard/calls",
      icon: Phone,
    },
    {
      title: "Flows",
      url: "/dashboard/flows",
      icon: Workflow,
    },
    {
      title: "Sandbox",
      url: "/dashboard/sandbox",
      icon: FlaskConical,
    },
    {
      title: "Recalibration",
      url: "/dashboard/recalibration",
      icon: RefreshCcw,
    },
  ],
  navAdmin: [
    {
      title: "Analytics",
      url: "/dashboard/analytics",
      icon: BarChart3,
    },
    {
      title: "Users",
      url: "/dashboard/users",
      icon: UserCog,
    },
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: Settings,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const currentUser = useCurrentUser()

  const user = {
    name: currentUser.name,
    email: currentUser.email,
    avatar: "",
  }

  // Filter admin nav items — super_admin only
  const filteredAdmin = data.navAdmin.filter(() => {
    return currentUser.role === "super_admin"
  })

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="/dashboard">
                <span className="text-2xl leading-none" role="img" aria-label="matcha">🍵</span>
                <span className="text-base font-semibold">Agent Matcha</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {filteredAdmin.length > 0 && (
          <NavSecondary items={filteredAdmin} className="mt-auto" />
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
