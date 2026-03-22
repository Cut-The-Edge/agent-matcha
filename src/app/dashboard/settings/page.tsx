"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { api } from "../../../../convex/_generated/api"
import { DEFAULT_INSTRUCTIONS_PROMPT, CRM_FIELD_SCHEMA, DEFAULT_MEMBERSHIP_PITCH_PROMPT } from "../../../../convex/voice/prompts"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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
  RotateCcw,
  Heart,
  Mic,
  Globe,
  Eye,
  ChevronsUpDown,
} from "lucide-react"
import { useWorkspace } from "@/hooks/use-workspace"
import { cn } from "@/lib/utils"

type SettingsTab = "global" | "workspace"
type PromptTab = "summary" | "membership"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const { workspace } = useWorkspace()
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
  const [summaryPrompt, setSummaryPrompt] = useState<string>("")
  const [spSaving, setSpSaving] = useState(false)
  const [spSaved, setSpSaved] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [membershipPitchPrompt, setMembershipPitchPrompt] = useState<string>("")
  const [mpSaving, setMpSaving] = useState(false)
  const [mpSaved, setMpSaved] = useState(false)
  const [mpPreviewOpen, setMpPreviewOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>("workspace")
  const [promptTab, setPromptTab] = useState<PromptTab>("summary")

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
    if (settings && "summaryPrompt" in settings) {
      setSummaryPrompt((settings.summaryPrompt as string) ?? "")
    }
    if (settings && "membershipPitchPrompt" in settings) {
      setMembershipPitchPrompt((settings.membershipPitchPrompt as string) ?? "")
    }
  }, [settings])

  const workspaceLabel = workspace === "matchmaking" ? "Matchmaking" : "Interviewer"
  const WorkspaceIcon = workspace === "matchmaking" ? Heart : Mic

  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      <div className="px-4 lg:px-6">
        <h2 className="page-heading">Settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure application settings
        </p>

        {/* Settings scope tabs */}
        <div className="mt-4 flex items-center gap-1 rounded-lg bg-muted/50 p-1 w-fit">
          <button
            onClick={() => setActiveTab("workspace")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "workspace"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <WorkspaceIcon className="h-3.5 w-3.5" />
            {workspaceLabel}
          </button>
          <button
            onClick={() => setActiveTab("global")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === "global"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Globe className="h-3.5 w-3.5" />
            Global
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-8 px-4 lg:px-6">
        {/* ───────── Interviewer workspace settings ───────── */}
        {activeTab === "workspace" && workspace === "interviewer" && (
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

            {/* ── Prompt sub-tabs ── */}
            <div className="mt-4 flex items-center gap-1 rounded-lg bg-muted/50 p-1 w-fit">
              <button
                onClick={() => setPromptTab("summary")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  promptTab === "summary"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Summary Prompt
              </button>
              <button
                onClick={() => setPromptTab("membership")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  promptTab === "membership"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Membership Pitch
              </button>
            </div>

            {/* ── Summary Prompt tab ── */}
            {promptTab === "summary" && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Summary Prompt
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p>Controls how the AI analyzes call transcripts and generates summaries. The CRM field schema is automatically appended and cannot be edited — this ensures extracted data always maps correctly to SmartMatch.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardTitle>
                  <CardDescription>
                    Customize the AI instructions for generating post-call summaries. CRM field mappings are locked and appended automatically.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={summaryPrompt || DEFAULT_INSTRUCTIONS_PROMPT}
                    onChange={(e) => {
                      setSummaryPrompt(e.target.value)
                      setSpSaved(false)
                    }}
                    maxLength={10000}
                    className="min-h-[300px] font-mono text-xs leading-relaxed"
                  />
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      disabled={spSaving}
                      onClick={async () => {
                        setSpSaving(true)
                        setSpSaved(false)
                        try {
                          const valueToSave = summaryPrompt === DEFAULT_INSTRUCTIONS_PROMPT ? "" : summaryPrompt
                          await updateSettings({ summaryPrompt: valueToSave })
                          setSpSaved(true)
                        } finally {
                          setSpSaving(false)
                        }
                      }}
                    >
                      {spSaving ? "Saving..." : spSaved ? "Saved" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={spSaving || !summaryPrompt || summaryPrompt === DEFAULT_INSTRUCTIONS_PROMPT}
                      onClick={async () => {
                        setSummaryPrompt("")
                        setSpSaved(false)
                        setSpSaving(true)
                        try {
                          await updateSettings({ summaryPrompt: "" })
                          setSpSaved(true)
                        } finally {
                          setSpSaving(false)
                        }
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Reset to default
                    </Button>
                  </div>

                  <Collapsible open={previewOpen} onOpenChange={setPreviewOpen} className="mt-4">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground px-0 hover:bg-transparent">
                        <Eye className="h-3.5 w-3.5" />
                        Preview full prompt
                        <ChevronsUpDown className="h-3.5 w-3.5" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-2 rounded-md border bg-muted/50 p-4 max-h-[400px] overflow-y-auto">
                        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                          Full prompt sent to LLM (your instructions + locked CRM schema)
                        </p>
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground/80">
                          {(summaryPrompt || DEFAULT_INSTRUCTIONS_PROMPT) + "\n" + CRM_FIELD_SCHEMA}
                        </pre>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
              </Card>
            )}

            {/* ── Membership Pitch tab ── */}
            {promptTab === "membership" && (
              <>
                <Card className="mt-4">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base flex items-center gap-2">
                          Membership Pitch
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[300px]">
                                <p>When enabled, the voice agent includes a brief, low-pressure membership overview (Phase 3) after the deep dive conversation. The pitch presents Membership and VIP Matchmaking tiers and gauges interest before wrapping up.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </CardTitle>
                        <CardDescription>
                          Include a soft-sell membership overview after the deep dive phase of each call
                        </CardDescription>
                      </div>
                      <Switch
                        checked={settings && "membershipPitchEnabled" in settings ? settings.membershipPitchEnabled !== false : true}
                        onCheckedChange={async (checked) => {
                          await updateSettings({ membershipPitchEnabled: checked })
                        }}
                      />
                    </div>
                  </CardHeader>
                </Card>

                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      Membership Pitch Script
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-[300px]">
                            <p>Customize the script the voice agent follows when presenting membership options. Leave empty to use the default script. Only used when the Membership Pitch toggle is enabled.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </CardTitle>
                    <CardDescription>
                      Customize the voice agent&apos;s membership pitch script. Leave empty to use the default.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={membershipPitchPrompt || DEFAULT_MEMBERSHIP_PITCH_PROMPT}
                      onChange={(e) => {
                        setMembershipPitchPrompt(e.target.value)
                        setMpSaved(false)
                      }}
                      maxLength={5000}
                      className="min-h-[250px] font-mono text-xs leading-relaxed"
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        size="sm"
                        disabled={mpSaving}
                        onClick={async () => {
                          setMpSaving(true)
                          setMpSaved(false)
                          try {
                            const valueToSave = membershipPitchPrompt === DEFAULT_MEMBERSHIP_PITCH_PROMPT ? "" : membershipPitchPrompt
                            await updateSettings({ membershipPitchPrompt: valueToSave })
                            setMpSaved(true)
                          } finally {
                            setMpSaving(false)
                          }
                        }}
                      >
                        {mpSaving ? "Saving..." : mpSaved ? "Saved" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mpSaving || !membershipPitchPrompt || membershipPitchPrompt === DEFAULT_MEMBERSHIP_PITCH_PROMPT}
                        onClick={async () => {
                          setMembershipPitchPrompt("")
                          setMpSaved(false)
                          setMpSaving(true)
                          try {
                            await updateSettings({ membershipPitchPrompt: "" })
                            setMpSaved(true)
                          } finally {
                            setMpSaving(false)
                          }
                        }}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Reset to default
                      </Button>
                    </div>

                    <Collapsible open={mpPreviewOpen} onOpenChange={setMpPreviewOpen} className="mt-4">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground px-0 hover:bg-transparent">
                          <Eye className="h-3.5 w-3.5" />
                          Preview pitch script
                          <ChevronsUpDown className="h-3.5 w-3.5" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 rounded-md border bg-muted/50 p-4 max-h-[400px] overflow-y-auto">
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                            Script injected into the voice agent during Phase 3
                          </p>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground/80">
                            {membershipPitchPrompt || DEFAULT_MEMBERSHIP_PITCH_PROMPT}
                          </pre>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ───────── Matchmaking workspace settings ───────── */}
        {activeTab === "workspace" && workspace === "matchmaking" && (
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
        )}

        {/* ───────── Global settings ───────── */}
        {activeTab === "global" && (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}
