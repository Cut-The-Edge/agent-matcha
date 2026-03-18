// @ts-nocheck
/**
 * Wrap-Up Messages
 *
 * Standard closing messages sent to members at the end of every match outcome.
 * These are used by the flow engine's executeEndNode and action nodes to send
 * a warm, outcome-appropriate closing message before the flow completes.
 *
 * All templates support {{memberFirstName}} and {{matchFirstName}} variables
 * that are resolved from the flow context.
 */

// ============================================================================
// Wrap-Up Message Templates
// ============================================================================

export const WRAP_UP_TEMPLATES = {
  /**
   * Sent when the member said "interested" and both parties matched.
   * The group chat / intro has been set up.
   */
  accepted_match:
    "Amazing, {{memberFirstName}}! I'm so excited for you and {{matchFirstName}}. " +
    "I've set things up for you two to connect. Be yourself, have fun, and don't " +
    "overthink it. Rooting for you! If you need anything, I'm always here.",

  /**
   * Sent when the member declined the match (not interested).
   * Feedback has been collected.
   */
  declined_match:
    "Thanks so much for sharing that feedback, {{memberFirstName}}. It really helps me " +
    "find someone who's a better fit for you. I'm already on it, and I'll be in touch " +
    "when I have someone I'm excited about. Hang tight!",

  /**
   * Sent when the member completes the full feedback flow
   * (categories + optional free text).
   */
  feedback_completed:
    "Got it, {{memberFirstName}}! I appreciate you taking the time to share all of that. " +
    "Every piece of feedback sharpens my instincts for your next match. " +
    "I'll circle back soon with someone new. Talk soon!",

  /**
   * Sent when the member never responded and the match expired
   * after the follow-up sequence (day 2, 5, 7, 8).
   */
  no_response:
    "Hey {{memberFirstName}}, since I haven't heard back I'll go ahead and close " +
    "this one out. No worries at all — whenever you're ready for your next match, " +
    "just reach out. I'm here for you!",

  /**
   * Sent when the member purchased the personal outreach upsell.
   * Payment confirmed, Dani will reach out.
   */
  upsell_purchased:
    "You're all set, {{memberFirstName}}! Payment confirmed. Dani will personally " +
    "reach out to {{matchFirstName}} on your behalf and get back to you with an update. " +
    "Exciting stuff! Sit tight.",

  /**
   * Sent when the member was interested but declined the upsell,
   * and chose to pass entirely.
   */
  upsell_declined_pass:
    "No problem at all, {{memberFirstName}}. I appreciate you considering it! " +
    "I'll keep looking for matches and be in touch soon. Onward!",

  /**
   * Sent when recalibration is triggered (3+ rejections).
   */
  recalibration_triggered:
    "{{memberFirstName}}, I want to make sure I'm sending you the right matches. " +
    "I've paused new introductions for now and Dani will reach out to chat about " +
    "what you're looking for. This is a good thing — we'll dial things in together!",
} as const;

export type WrapUpOutcome = keyof typeof WRAP_UP_TEMPLATES;

/**
 * Get the wrap-up message for a given outcome, resolved with context variables.
 */
export function getWrapUpMessage(
  outcome: WrapUpOutcome,
  context: Record<string, any>,
): string {
  const template = WRAP_UP_TEMPLATES[outcome];
  if (!template) return "";

  // Replace {{key}} patterns with context/metadata values
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (context.metadata?.[key]) return String(context.metadata[key]);
    if (context[key]) return String(context[key]);
    return match;
  });
}
