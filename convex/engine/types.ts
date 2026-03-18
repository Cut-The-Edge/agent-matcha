// @ts-nocheck
/**
 * Flow Engine — Type Definitions
 *
 * Core types for the data-driven conversation flow system.
 * These types define node configurations, flow context, and transition results
 * used by the interpreter, executor, and transition modules.
 */

// ============================================================================
// Node Types
// ============================================================================

export const NODE_TYPES = {
  START: "start",
  MESSAGE: "message",
  DECISION: "decision",
  FEEDBACK_COLLECT: "feedback_collect",
  ACTION: "action",
  DELAY: "delay",
  CONDITION: "condition",
  END: "end",
} as const;

export type NodeType = (typeof NODE_TYPES)[keyof typeof NODE_TYPES];

// ============================================================================
// Flow Types
// ============================================================================

export const FLOW_TYPES = {
  MATCH_FEEDBACK: "match_feedback",
  RECALIBRATION: "recalibration",
  FOLLOW_UP: "follow_up",
  PERSONAL_OUTREACH: "personal_outreach",
} as const;

export type FlowType = (typeof FLOW_TYPES)[keyof typeof FLOW_TYPES];

// ============================================================================
// Instance Status
// ============================================================================

export const INSTANCE_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  EXPIRED: "expired",
  ERROR: "error",
} as const;

export type InstanceStatus =
  (typeof INSTANCE_STATUS)[keyof typeof INSTANCE_STATUS];

// ============================================================================
// Execution Actions
// ============================================================================

export const EXECUTION_ACTIONS = {
  ENTERED: "entered",
  EXECUTED: "executed",
  EXITED: "exited",
  ERROR: "error",
  SKIPPED: "skipped",
} as const;

export type ExecutionAction =
  (typeof EXECUTION_ACTIONS)[keyof typeof EXECUTION_ACTIONS];

// ============================================================================
// Node Config Interfaces
// ============================================================================

export interface StartNodeConfig {
  triggerType: string;
}

export interface MessageNodeConfig {
  template: string;
  channel: "whatsapp" | "sms" | "email";
  mediaUrl?: string;
  templateKey?: string;
}

export interface DecisionNodeConfig {
  question: string;
  options: Array<{
    value: string;
    label: string;
    edgeId: string;
  }>;
  timeout?: number;
  timeoutEdgeId?: string;
  templateKey?: string;
}

export interface FeedbackCollectNodeConfig {
  categories: string[];
  allowFreeText: boolean;
  feedbackType: string;
  prompt?: string;
  timeout?: number;
  timeoutMessage?: string;
}

export interface ActionNodeConfig {
  actionType:
    | "sync_to_sma"
    | "notify_admin"
    | "update_match_status"
    | "create_stripe_link"
    | "send_introduction"
    | "create_group_chat"
    | "schedule_recalibration"
    | "expire_match"
    | "send_wrapup"
    | "create_escalation";
  params: Record<string, any>;
}

export interface DelayNodeConfig {
  duration: number;
  unit: "minutes" | "hours" | "days";
  reminderAt?: number;
  reminderTemplate?: string;
  timeoutEdgeId?: string;
}

export interface ConditionNodeConfig {
  expression: string;
  trueEdgeId: string;
  falseEdgeId: string;
}

export interface EndNodeConfig {
  endType: "completed" | "expired" | "cancelled" | "error";
}

export type NodeConfig =
  | StartNodeConfig
  | MessageNodeConfig
  | DecisionNodeConfig
  | FeedbackCollectNodeConfig
  | ActionNodeConfig
  | DelayNodeConfig
  | ConditionNodeConfig
  | EndNodeConfig;

// ============================================================================
// Graph Structures
// ============================================================================

export interface FlowNode {
  nodeId: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  config: NodeConfig;
}

export interface FlowEdge {
  edgeId: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

// ============================================================================
// Flow Context (Runtime State)
// ============================================================================

export interface FlowContext {
  /** Collected member responses keyed by nodeId */
  responses: Record<string, any>;
  /** Collected feedback categories */
  feedbackCategories: string[];
  /** Free text feedback */
  feedbackFreeText?: string;
  /** Current member decision (interested, not_interested, etc.) */
  memberDecision?: string;
  /** Whether the instance is waiting for member input */
  waitingForInput: boolean;
  /** The nodeId we're waiting on (for decision/feedback nodes) */
  waitingNodeId?: string;
  /** Timestamps for various events */
  timestamps: Record<string, number>;
  /** Rejection count at time of flow start */
  rejectionCount?: number;
  /** Payment status for personal outreach */
  paymentReceived?: boolean;
  /** Consent given for introductions */
  consentGiven?: boolean;
  /** Any additional metadata */
  metadata: Record<string, any>;
}

// ============================================================================
// Transition Result
// ============================================================================

export interface TransitionResult {
  /** Whether the transition was successful */
  success: boolean;
  /** The next nodeId to transition to (null if staying) */
  nextNodeId: string | null;
  /** The edge that was followed */
  edgeId?: string;
  /** Updated context after the transition */
  updatedContext: FlowContext;
  /** Error message if transition failed */
  error?: string;
  /** Whether the flow should wait for external input */
  shouldWait: boolean;
  /** Delay in milliseconds if a delay node was hit */
  delayMs?: number;
}
