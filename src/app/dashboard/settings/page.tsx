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
  ClipboardList,
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
  const [drExpirationHours, setDrExpirationHours] = useState<string>("")
  const [drAutoSendDelayDays, setDrAutoSendDelayDays] = useState<string>("")
  const [drSaving, setDrSaving] = useState(false)
  const [drSaved, setDrSaved] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (settings && "profileExpirationHours" in settings) {
      setExpirationHours(String(settings.profileExpirationHours))
    }
    if (settings && "dataRequestExpirationHours" in settings) {
      setDrExpirationHours(String(settings.dataRequestExpirationHours ?? 72))
    }
    if (settings && "dataRequestAutoSendDelayDays" in settings) {
      setDrAutoSendDelayDays(String(settings.dataRequestAutoSendDelayDays ?? 3))
    }
  }, [settings])

  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure application settings
        </p>
      </div>

      <div className="flex flex-col gap-8 px-4 lg:px-6">
        {/* General Section */}
        <div>
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2.5 tracking-tight">
            <Settings className="h-4.5 w-4.5" />
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
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2.5 tracking-tight">
            <Phone className="h-4.5 w-4.5" />
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

        {/* Data Requests Section */}
        <div>
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2.5 tracking-tight">
            <ClipboardList className="h-4.5 w-4.5" />
            Data Requests
          </h3>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Link Expiration
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[300px]">
                      <p>How long the data request form link stays active before expiring. Members who click an expired link will see an expiration message.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>
                Set how long data request form links remain accessible
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
                    value={drExpirationHours}
                    onChange={(e) => {
                      setDrExpirationHours(e.target.value)
                      setDrSaved(false)
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={drSaving || !drExpirationHours || Number(drExpirationHours) < 1}
                  onClick={async () => {
                    setDrSaving(true)
                    setDrSaved(false)
                    try {
                      await updateSettings({
                        dataRequestExpirationHours: Number(drExpirationHours),
                      })
                      setDrSaved(true)
                    } finally {
                      setDrSaving(false)
                    }
                  }}
                >
                  {drSaving ? "Saving..." : drSaved ? "Saved" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Auto-send forms
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p>When enabled, data request forms are automatically sent to new members with missing profile data after the configured delay. Only members without a pending or completed request will receive a form.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>
                  <CardDescription>
                    Automatically send profile completion forms to new members with missing data
                  </CardDescription>
                </div>
                <Switch
                  checked={settings && "dataRequestAutoSendEnabled" in settings ? settings.dataRequestAutoSendEnabled === true : false}
                  onCheckedChange={async (checked) => {
                    await updateSettings({ dataRequestAutoSendEnabled: checked })
                  }}
                />
              </div>
            </CardHeader>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Auto-send Delay
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[300px]">
                      <p>How many days after a member is created before the system automatically sends them a data request form. This gives you time to manually reach out first if needed.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription>
                Wait this many days after member creation before auto-sending
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <div className="flex-1 max-w-[200px]">
                  <label className="text-sm font-medium mb-1.5 block">
                    Delay (days)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={drAutoSendDelayDays}
                    onChange={(e) => {
                      setDrAutoSendDelayDays(e.target.value)
                      setDrSaved(false)
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={drSaving || !drAutoSendDelayDays || Number(drAutoSendDelayDays) < 1}
                  onClick={async () => {
                    setDrSaving(true)
                    setDrSaved(false)
                    try {
                      await updateSettings({
                        dataRequestAutoSendDelayDays: Number(drAutoSendDelayDays),
                      })
                      setDrSaved(true)
                    } finally {
                      setDrSaving(false)
                    }
                  }}
                >
                  {drSaving ? "Saving..." : drSaved ? "Saved" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base flex items-center gap-2">
                    Allow resubmit
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p>When enabled, members can re-open and update their form even after submitting. Useful if they need to correct or add information later.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>
                  <CardDescription>
                    Keep form links active after submission so members can update their info
                  </CardDescription>
                </div>
                <Switch
                  checked={settings && "dataRequestAllowResubmit" in settings ? settings.dataRequestAllowResubmit === true : false}
                  onCheckedChange={async (checked) => {
                    await updateSettings({ dataRequestAllowResubmit: checked })
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
