"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Check, X, ArrowUpDown, Pencil, RefreshCw, Loader2, ExternalLink, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Doc } from "../../../convex/_generated/dataModel"
import { format } from "date-fns"

export interface MemberTableMeta {
  onEdit?: (member: Member) => void
  onSync?: (member: Member) => void
  onViewIntros?: (member: Member) => void
  onSendDataRequest?: (member: Member) => void
  syncingMemberId?: string | null
  sendingDataRequestMemberId?: string | null
}

type Member = Doc<"members">

const tierConfig: Record<string, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-secondary text-secondary-foreground",
  },
  member: {
    label: "Member",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  vip: {
    label: "VIP",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  recalibrating: {
    label: "Recalibrating",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
}

const introGroupConfig: Record<string, { label: string; className: string }> = {
  active: { label: "A", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  rejected: { label: "R", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  past: { label: "Pa", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  potential: { label: "Po", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  successful: { label: "S", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  automated: { label: "Au", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  notSuitable: { label: "NS", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
}

export const columns: ColumnDef<Member>[] = [
  {
    id: "name",
    accessorFn: (row) =>
      `${row.firstName}${row.lastName ? ` ${row.lastName}` : ""}`,
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Name
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const firstName = row.original.firstName
      const lastName = row.original.lastName
      const profilePictureUrl = (row.original as any).profilePictureUrl
      const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase()
      return (
        <div className="flex items-center gap-2.5">
          {profilePictureUrl ? (
            <img
              src={profilePictureUrl}
              alt={firstName}
              className="size-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
              {initials || "?"}
            </div>
          )}
          <span className="font-medium">
            {firstName}
            {lastName ? ` ${lastName}` : ""}
          </span>
        </div>
      )
    },
    enableHiding: false,
  },
  {
    accessorKey: "gender",
    header: "Gender",
    cell: ({ row }) => (
      <span className="text-muted-foreground capitalize">
        {row.original.gender || "---"}
      </span>
    ),
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "smaId",
    header: "CRM ID",
    cell: ({ row }) => {
      const smaId = row.original.smaId
      const isNumeric = smaId && /^\d+$/.test(smaId)
      if (!isNumeric) {
        return <span className="text-muted-foreground text-xs">{smaId || "---"}</span>
      }
      return (
        <a
          href={`https://club-allenby.smartmatchapp.com/#!/client/${smaId}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
        >
          {smaId}
          <ExternalLink className="size-3" />
        </a>
      )
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.email || "---"}
      </span>
    ),
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.phone || "---"}
      </span>
    ),
  },
  {
    accessorKey: "tier",
    header: "Tier",
    cell: ({ row }) => {
      const tier = row.original.tier
      const config = tierConfig[tier]
      return (
        <Badge
          variant="outline"
          className={`border-transparent ${config.className}`}
        >
          {config.label}
        </Badge>
      )
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status
      const config = statusConfig[status]
      return (
        <Badge
          variant="outline"
          className={`border-transparent ${config.className}`}
        >
          {config.label}
        </Badge>
      )
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    id: "introductions",
    accessorFn: (row: any) => row.smaIntroSummary?.total ?? 0,
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Intros
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row, table }: any) => {
      const summary = row.original.smaIntroSummary
      const meta = table.options.meta as MemberTableMeta | undefined
      if (!summary) {
        return <span className="text-muted-foreground text-xs">---</span>
      }
      const groups = Object.entries(introGroupConfig)
        .filter(([key]) => (summary as any)[key] > 0)
        .map(([key, config]) => (
          <Badge
            key={key}
            variant="outline"
            className={`border-transparent px-1.5 py-0 text-[11px] leading-snug ${config.className}`}
          >
            {config.label}:{(summary as any)[key]}
          </Badge>
        ))
      if (groups.length === 0) {
        return <span className="text-muted-foreground text-xs">0</span>
      }
      return (
        <button
          className="flex flex-wrap gap-0.5 hover:opacity-80"
          onClick={() => meta?.onViewIntros?.(row.original)}
        >
          {groups}
        </button>
      )
    },
    sortingFn: (rowA: any, rowB: any) => {
      const a = rowA.original.smaIntroSummary?.total ?? 0
      const b = rowB.original.smaIntroSummary?.total ?? 0
      return a - b
    },
  },
  {
    accessorKey: "rejectionCount",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Rejections
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.rejectionCount}</span>
    ),
  },
  {
    accessorKey: "profileComplete",
    header: "Profile",
    cell: ({ row }) =>
      row.original.profileComplete ? (
        <Check className="size-4 text-green-600 dark:text-green-400" />
      ) : (
        <X className="size-4 text-muted-foreground" />
      ),
  },
  {
    accessorKey: "lastSyncedAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Last Synced
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums">
        {format(new Date(row.original.lastSyncedAt), "MMM d, yyyy")}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as MemberTableMeta | undefined
      const isSyncing = meta?.syncingMemberId === row.original._id
      const isSendingDataRequest = meta?.sendingDataRequestMemberId === row.original._id
      const hasSmaId = row.original.smaId && /^\d+$/.test(row.original.smaId)
      const hasPhone = !!row.original.phone
      return (
        <div className="flex items-center gap-1">
          {hasPhone && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={isSendingDataRequest}
              onClick={() => meta?.onSendDataRequest?.(row.original)}
              title="Send data request form"
            >
              {isSendingDataRequest ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Send className="size-3.5" />
              )}
            </Button>
          )}
          {hasSmaId && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={isSyncing}
              onClick={() => meta?.onSync?.(row.original)}
              title="Sync from SMA"
            >
              {isSyncing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => meta?.onEdit?.(row.original)}
          >
            <Pencil className="mr-1 size-3" />
            Edit
          </Button>
        </div>
      )
    },
    enableHiding: false,
  },
]
