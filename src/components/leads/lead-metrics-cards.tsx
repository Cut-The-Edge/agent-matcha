"use client"

import { Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"

export function LeadMetricsCards() {
  const metrics = useAuthQuery(api.membershipLeads.queries.metrics, {})

  return (
    <div className="stagger grid gap-4 px-4 lg:px-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {metrics?.pendingCount ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Awaiting approval</p>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Approved</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {metrics?.approvedThisMonth ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">This month</p>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Denied</CardTitle>
          <XCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {metrics?.deniedThisMonth ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">This month</p>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Expired</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {metrics?.expiredThisMonth ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">SLA breached this month</p>
        </CardContent>
      </Card>
    </div>
  )
}
