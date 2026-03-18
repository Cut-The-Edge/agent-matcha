"use client"

import * as React from "react"
import {
  LayoutDashboard,
  Users,
  UserPlus,
  MessageSquare,
  Phone,
  Workflow,
  FlaskConical,
  RefreshCcw,
  ClipboardList,
  BarChart3,
  UserCog,
  Settings,
  AlertTriangle,
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
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { useCurrentUser } from "@/hooks/use-current-user"

const data = {
  navCRM: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: LayoutDashboard,
      description: "Your command center — see key metrics and recent activity at a glance",
    },
    {
      title: "Members",
      url: "/dashboard/members",
      icon: Users,
      description: "View, search, and manage all community members in your network",
    },
    {
      title: "Leads",
      url: "/dashboard/leads",
      icon: UserPlus,
      hasBadge: true,
      description: "Review membership upgrade requests and approve or deny them",
    },
    {
      title: "Messages",
      url: "/dashboard/conversations",
      icon: MessageSquare,
      description: "Read and manage WhatsApp conversations with your members",
    },
    {
      title: "Calls",
      url: "/dashboard/calls",
      icon: Phone,
      description: "View voice call logs, listen to recordings, and check transcripts",
    },
    {
      title: "Escalations",
      url: "/dashboard/escalations",
      icon: AlertTriangle,
      hasBadge: true,
      description: "Items needing attention: unrecognized responses, special requests, purchases",
    },
    {
      title: "Recalibration",
      url: "/dashboard/recalibration",
      icon: RefreshCcw,
      description: "Members who rejected a match and need their preferences updated",
    },
    {
      title: "Data Requests",
      url: "/dashboard/data-requests",
      icon: ClipboardList,
      description: "Send profile completion forms to members with missing data",
    },
  ],
  navTools: [
    {
      title: "Automations",
      url: "/dashboard/flows",
      icon: Workflow,
      description: "Create and edit automated WhatsApp conversation flows",
    },
  ],
  navDevTools: [
    {
      title: "Sandbox",
      url: "/dashboard/sandbox",
      icon: FlaskConical,
      description: "Test your automations and messages before sending them live",
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

  // Filter admin nav items — super_admin and developer
  const filteredAdmin = data.navAdmin.filter(() => {
    return currentUser.role === "super_admin" || currentUser.role === "developer"
  })

  // Developer-only tools (Sandbox)
  const filteredDevTools = data.navDevTools.filter(() => {
    return currentUser.role === "developer"
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
        <NavMain items={data.navCRM} />
        <SidebarSeparator />
        <NavMain items={[...data.navTools, ...filteredDevTools]} label="Tools" />
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
