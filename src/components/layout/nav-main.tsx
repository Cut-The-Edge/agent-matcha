"use client"

import { usePathname } from "next/navigation"
import type { LucideIcon } from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"

function LeadsBadge() {
  const count = useAuthQuery(api.membershipLeads.queries.countPending, {})
  if (!count) return null
  return <SidebarMenuBadge>{count}</SidebarMenuBadge>
}

function ComingSoonBadge() {
  return (
    <SidebarMenuBadge className="text-[10px] text-muted-foreground/70">
      Soon
    </SidebarMenuBadge>
  )
}

export function NavMain({
  items,
  label,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    hasBadge?: boolean
    comingSoon?: boolean
    description?: string
  }[]
  label?: string
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isActive =
              item.title === "Dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.url)

            return (
              <SidebarMenuItem key={item.title}>
                {item.description ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton isActive={isActive} asChild>
                        <a href={item.url}>
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center" className="max-w-[220px]">
                      {item.description}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <SidebarMenuButton tooltip={item.title} isActive={isActive} asChild>
                    <a href={item.url}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                )}
                {item.hasBadge && <LeadsBadge />}
                {item.comingSoon && <ComingSoonBadge />}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
