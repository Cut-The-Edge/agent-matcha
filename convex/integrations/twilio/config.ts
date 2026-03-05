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
 */
export function toWhatsAppFormat(phone: string): string {
  // Already in WhatsApp format
  if (phone.startsWith("whatsapp:")) return phone;

  // Strip spaces, dashes, parentheses → E.164 format
  const stripped = phone.replace(/[\s\-\(\)]/g, "");
  const normalized = stripped.startsWith("+") ? stripped : `+${stripped}`;
  return `whatsapp:${normalized}`;
}

/**
 * Extract the raw phone number from a WhatsApp-formatted string.
 */
export function fromWhatsAppFormat(whatsappId: string): string {
  return whatsappId.replace("whatsapp:", "");
}
