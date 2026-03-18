import { UserPlus } from "lucide-react"

export default function LeadsPage() {
  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="flex min-h-[60vh] items-center justify-center px-4 lg:px-6">
        <div className="flex max-w-md flex-col items-center text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <UserPlus className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Coming Soon</h2>
          <p className="mt-2 text-muted-foreground">
            Track and manage incoming leads from your matchmaking pipeline.
          </p>
        </div>
      </div>
    </div>
  )
}
