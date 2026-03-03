"use client"

import { useRouter } from "next/navigation"
import {
  Heart,
  Users,
  MessageSquare,
  Plus,
  ArrowRight,
  Activity,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function RecentActivity() {
  const router = useRouter()

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest matchmaking events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Activity className="mx-auto mb-3 size-8 opacity-40" />
              <p className="text-sm font-medium">No activity yet</p>
              <p className="mt-1 text-xs">
                Events will appear here as matches are made
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common matchmaking tasks</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-3"
            onClick={() => router.push("/dashboard/matches")}
          >
            <Heart className="size-4 shrink-0 text-pink-500" />
            <div className="flex flex-1 items-center justify-between">
              <div className="text-left">
                <div className="text-sm font-medium">Create New Match</div>
                <div className="text-xs text-muted-foreground">
                  Pair two members together
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-3"
            onClick={() => router.push("/dashboard/members")}
          >
            <Plus className="size-4 shrink-0 text-blue-500" />
            <div className="flex flex-1 items-center justify-between">
              <div className="text-left">
                <div className="text-sm font-medium">Add Member</div>
                <div className="text-xs text-muted-foreground">
                  Register a new community member
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-3"
            onClick={() => router.push("/dashboard/conversations")}
          >
            <MessageSquare className="size-4 shrink-0 text-green-500" />
            <div className="flex flex-1 items-center justify-between">
              <div className="text-left">
                <div className="text-sm font-medium">View Conversations</div>
                <div className="text-xs text-muted-foreground">
                  Check member messages and responses
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </Button>
          <Button
            variant="outline"
            className="h-auto justify-start gap-3 px-4 py-3"
            onClick={() => router.push("/dashboard/members")}
          >
            <Users className="size-4 shrink-0 text-purple-500" />
            <div className="flex flex-1 items-center justify-between">
              <div className="text-left">
                <div className="text-sm font-medium">Browse Members</div>
                <div className="text-xs text-muted-foreground">
                  View and manage your community
                </div>
              </div>
              <ArrowRight className="size-4 text-muted-foreground" />
            </div>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
