"use client"

import { Clock, ArrowRight, CheckCircle, AlertTriangle } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"

export function ActionMetricsCards() {
  const counts = useAuthQuery(api.actionQueue.queries.getCounts, {})

  return (
    <div className="stagger grid gap-4 px-4 lg:px-6 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {counts?.pending ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Awaiting action</p>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {counts?.inProgress ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Being worked on</p>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Resolved</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {counts?.resolved ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Completed</p>
        </CardContent>
      </Card>

      <Card className="card-hover">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Expired</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {counts?.expired ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Timed out</p>
        </CardContent>
      </Card>
    </div>
  )
}
