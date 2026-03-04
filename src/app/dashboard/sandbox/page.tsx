"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { FlaskConical, Phone } from "lucide-react"
import { WhatsAppSandboxContent } from "@/components/sandbox/whatsapp-sandbox"
import { VoiceSandbox } from "@/components/sandbox/voice-sandbox"

export default function SandboxPage() {
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Sandbox</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Test flows and voice calls end-to-end with real members
        </p>
      </div>

      <Tabs defaultValue="whatsapp" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border px-6 pt-2">
          <TabsList>
            <TabsTrigger value="whatsapp">WhatsApp Flows</TabsTrigger>
            <TabsTrigger value="voice">
              <Phone className="size-3.5" />
              Voice Calls
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="whatsapp" className="flex-1 overflow-hidden">
          <WhatsAppSandboxContent />
        </TabsContent>

        <TabsContent value="voice" className="flex-1 overflow-auto p-6">
          <VoiceSandbox />
        </TabsContent>
      </Tabs>
    </div>
  )
}
