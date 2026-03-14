"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../../convex/_generated/api"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Sun,
  Moon,
  Monitor,
  Settings,
  Link,
  Phone,
  HelpCircle,
} from "lucide-react"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const settings = useAuthQuery(api.settings.get, {})
  const { mutateWithAuth: updateSettings } = useAuthMutation(api.settings.update)
  const [expirationHours, setExpirationHours] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (settings && "profileExpirationHours" in settings) {
      setExpirationHours(String(settings.profileExpirationHours))
    }
  }, [settings])

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure application settings
        </p>
      </div>

      <div className="flex flex-col gap-6 px-4 lg:px-6">
        {/* General Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General
          </h3>

          {/* Theme Toggle */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
              <CardDescription>
                Choose your preferred theme
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant={mounted && theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("light")}
                >
                  <Sun className="h-4 w-4 mr-1" />
                  Light
                </Button>
                <Button
                  variant={mounted && theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("dark")}
                >
                  <Moon className="h-4 w-4 mr-1" />
                  Dark
                </Button>
                <Button
                  variant={mounted && theme === "system" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTheme("system")}
                >
                  <Monitor className="h-4 w-4 mr-1" />
                  System
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profile Links */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link className="h-4 w-4" />
                Profile Links
              </CardTitle>
              <CardDescription>
                Set how long intro profile pages remain accessible
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <div className="flex-1 max-w-[200px]">
                  <label className="text-sm font-medium mb-1.5 block">
                    Expiration time (hours)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={expirationHours}
                    onChange={(e) => {
                      setExpirationHours(e.target.value)
                      setSaved(false)
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={saving || !expirationHours || Number(expirationHours) < 1}
                  onClick={async () => {
                    setSaving(true)
                    setSaved(false)
                    try {
                      await updateSettings({
                        profileExpirationHours: Number(expirationHours),
                      })
                      setSaved(true)
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  {saving ? "Saving..." : saved ? "Saved" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Voice Agent Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Voice Agent
          </h3>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Auto-sync calls to CRM
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p>When enabled, data extracted from inbound phone calls (name, age, preferences, etc.) is automatically synced to the member&apos;s CRM profile after each call ends. Disable this if you prefer to review and sync manually from the call detail page.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>
                  <CardDescription>
                    Automatically push extracted call data to SmartMatch CRM after each inbound call
                  </CardDescription>
                </div>
                <Switch
                  checked={settings && "autoSyncCallsToCrm" in settings ? settings.autoSyncCallsToCrm !== false : true}
                  onCheckedChange={async (checked) => {
                    await updateSettings({ autoSyncCallsToCrm: checked })
                  }}
                />
              </div>
            </CardHeader>
          </Card>
        </div>

      </div>
    </div>
  )
}
