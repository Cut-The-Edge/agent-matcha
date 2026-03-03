// @ts-nocheck
/**
 * Deepgram Configuration
 *
 * API URL constant and key getter for the Deepgram speech-to-text service.
 */

export const DEEPGRAM_API_URL =
  "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en";

export function getDeepgramApiKey(): string {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    throw new Error("DEEPGRAM_API_KEY environment variable is not set");
  }
  return key;
}
