"use client"

import { useMemo } from "react"

export type MonitorNodeStatus = "idle" | "active" | "completed" | "waiting" | "error"

export interface TraversedEdge {
  source: string
  target: string
  edgeId?: string
}

interface ExecutionLog {
  nodeId: string
  nodeType: string
  action: string
  output?: string | null
  timestamp: number
}

interface UseNodeStatusesResult {
  nodeStatuses: Record<string, MonitorNodeStatus>
  traversedEdges: TraversedEdge[]
}

/**
 * Walks execution logs chronologically to compute per-node visual status
 * and which edges have been traversed.
 *
 * Status mapping:
 * - "entered" → active
 * - "executed" with waitingForInput in output → waiting
 * - "exited" → completed (+ record edge traversal)
 * - "error" → error
 *
 * Final pass: override currentNodeId to "active" based on instance status.
 */
export function useNodeStatuses(
  logs: ExecutionLog[] | undefined,
  currentNodeId: string | undefined,
  instanceStatus: string | undefined
): UseNodeStatusesResult {
  return useMemo(() => {
    const nodeStatuses: Record<string, MonitorNodeStatus> = {};
    const traversedEdges: TraversedEdge[] = [];

    if (!logs || logs.length === 0) {
      return { nodeStatuses, traversedEdges };
    }

    // Walk logs in chronological order (already sorted asc by query)
    for (const log of logs) {
      switch (log.action) {
        case "entered":
          nodeStatuses[log.nodeId] = "active";
          break;

        case "executed": {
          // Check if the node is waiting for input
          let isWaiting = false;
          if (log.output) {
            try {
              const parsed = JSON.parse(log.output);
              if (parsed.waitingForInput) {
                isWaiting = true;
              }
            } catch {
              // Not JSON, ignore
            }
          }
          nodeStatuses[log.nodeId] = isWaiting ? "waiting" : "active";
          break;
        }

        case "exited": {
          nodeStatuses[log.nodeId] = "completed";
          // Try to extract edge traversal info from output
          if (log.output) {
            try {
              const parsed = JSON.parse(log.output);
              if (parsed.nextNode) {
                traversedEdges.push({
                  source: log.nodeId,
                  target: parsed.nextNode,
                  edgeId: parsed.edgeId || parsed.edge,
                });
              }
            } catch {
              // Not JSON, ignore
            }
          }
          break;
        }

        case "error":
          nodeStatuses[log.nodeId] = "error";
          break;

        case "skipped":
          nodeStatuses[log.nodeId] = "completed";
          break;
      }
    }

    // Final pass: ensure the current node reflects the instance status
    if (currentNodeId) {
      if (instanceStatus === "active") {
        const currentStatus = nodeStatuses[currentNodeId];
        // If the node is "waiting" keep it; otherwise set to "active"
        if (currentStatus !== "waiting" && currentStatus !== "error") {
          nodeStatuses[currentNodeId] = "active";
        }
      } else if (instanceStatus === "completed" || instanceStatus === "expired") {
        nodeStatuses[currentNodeId] = "completed";
      } else if (instanceStatus === "error") {
        nodeStatuses[currentNodeId] = "error";
      }
    }

    return { nodeStatuses, traversedEdges };
  }, [logs, currentNodeId, instanceStatus]);
}
