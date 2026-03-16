// @ts-nocheck
/**
 * Twilio Configuration
 *
 * Sets up the @convex-dev/twilio component client and exports helpers
 * for phone number formatting and env var access.
 */

import { Twilio } from "@convex-dev/twilio";
import { components } from "../../_generated/api";

/**
 * Create a Twilio client instance for use inside Convex actions.
 * Must be called inside an action handler (needs RunActionCtx).
 */
export function createTwilioClient() {
  return new Twilio(components.twilio, {
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    defaultFrom: process.env.TWILIO_WHATSAPP_NUMBER,
  });
}

/**
 * Format a phone number into WhatsApp format for Twilio.
 * Twilio requires "whatsapp:+1234567890" format.
 *
 * Handles common US formats:
 *   (754) 202-6432  → whatsapp:+17542026432
 *   754-202-6432    → whatsapp:+17542026432
 *   7542026432      → whatsapp:+17542026432
 *   +17542026432    → whatsapp:+17542026432
 *   17542026432     → whatsapp:+17542026432
 */
export function toWhatsAppFormat(phone: string): string {
  // Already in WhatsApp format
  if (phone.startsWith("whatsapp:")) return phone;

  // Strip spaces, dashes, parentheses, dots
  const stripped = phone.replace(/[\s\-\(\)\.]/g, "");

  // Remove leading + for uniform handling
  const digits = stripped.startsWith("+") ? stripped.slice(1) : stripped;

  // US number normalization: 10 digits without country code → prepend 1
  if (digits.length === 10 && !digits.startsWith("1")) {
    return `whatsapp:+1${digits}`;
  }

  return `whatsapp:+${digits}`;
}

/**
 * Extract the raw phone number from a WhatsApp-formatted string.
 */
export function fromWhatsAppFormat(whatsappId: string): string {
  return whatsappId.replace("whatsapp:", "");
}
