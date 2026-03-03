"use client"

import { use } from "react"
import { FlowMonitor } from "@/components/flows/monitor/flow-monitor"

export default function MonitorPage({
  params,
}: {
  params: Promise<{ instanceId: string }>
}) {
  const { instanceId } = use(params)
  return <FlowMonitor instanceId={instanceId} />
}
