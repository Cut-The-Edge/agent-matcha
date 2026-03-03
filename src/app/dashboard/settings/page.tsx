"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Sun,
  Moon,
  Monitor,
  MessageSquare,
  Heart,
  CreditCard,
  Settings,
  Info,
} from "lucide-react"

// ============================================================================
// Integration cards data
// ============================================================================

const integrations = [
  {
    name: "Twilio",
    description: "WhatsApp messaging for member conversations",
    icon: MessageSquare,
    status: "Not configured",
    connected: false,
  },
  {
    name: "SmartMatchApp",
    description: "Member and match data synchronization",
    icon: Heart,
    status: "Not configured",
    connected: false,
  },
  {
    name: "Stripe",
    description: "Payment processing for personal outreach",
    icon: CreditCard,
    status: "Not configured",
    connected: false,
  },
]

// ============================================================================
// Page
// ============================================================================

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">
          Configure application settings and integrations
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
        </div>

        <Separator />

        {/* Integrations Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Integrations</h3>
          <div className="grid gap-4 md:grid-cols-3">
            {integrations.map((integration) => (
              <Card key={integration.name}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <integration.icon className="h-5 w-5" />
                      {integration.name}
                    </CardTitle>
                    <Badge variant={integration.connected ? "default" : "secondary"}>
                      {integration.status}
                    </Badge>
                  </div>
                  <CardDescription>
                    {integration.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" disabled>
                    Configure
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Separator />

        {/* About Section */}
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info className="h-5 w-5" />
            About
          </h3>
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Application</span>
                  <span className="text-sm font-medium">Agent Matcha</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Version</span>
                  <span className="text-sm font-medium">0.1.0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Backend</span>
                  <span className="text-sm font-medium">Convex</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Framework</span>
                  <span className="text-sm font-medium">Next.js 15</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
