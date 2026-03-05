// @ts-nocheck
/**
 * SmartMatchApp API Client
 *
 * HTTP client for the SMA REST API (api3).
 * Used inside Convex actions (not queries/mutations — they can't do external HTTP).
 *
 * Auth: HTTP Basic Auth with token as username, empty password.
 * Base URL: https://club-allenby.smartmatchapp.com/api3/
 */

const SMA_BASE_URL = "https://club-allenby.smartmatchapp.com/api3";

function getAuthHeader(): string {
  const token = process.env.SMA_API_TOKEN;
  if (!token) throw new Error("SMA_API_TOKEN env var not set");
  // Basic Auth: base64(token:) — token as username, empty password
  return "Basic " + btoa(token + ":");
}

/**
 * Make a GET request to the SMA API.
 */
export async function smaGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${SMA_BASE_URL}${path}`);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.append(key, val);
    }
  }

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: getAuthHeader() },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SMA API GET ${path} failed (${resp.status}): ${text}`);
  }

  return resp.json();
}

/**
 * Make a POST request to the SMA API (form-encoded).
 */
export async function smaPost(path: string, data?: Record<string, string>): Promise<any> {
  const form = new URLSearchParams();
  if (data) {
    for (const [key, val] of Object.entries(data)) {
      form.append(key, val);
    }
  }

  const resp = await fetch(`${SMA_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SMA API POST ${path} failed (${resp.status}): ${text}`);
  }

  return resp.json();
}

/**
 * Make a PUT request to the SMA API (form-encoded).
 * Returns true on success (204 No Content).
 */
export async function smaPut(path: string, data: Record<string, string>): Promise<boolean> {
  const form = new URLSearchParams();
  for (const [key, val] of Object.entries(data)) {
    form.append(key, val);
  }

  const resp = await fetch(`${SMA_BASE_URL}${path}`, {
    method: "PUT",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SMA API PUT ${path} failed (${resp.status}): ${text}`);
  }

  return true;
}

// ── High-level helpers ──────────────────────────────────────────────

/**
 * Search for a client by phone number.
 * Returns the first matching client or null.
 */
export async function findClientByPhone(phone: string): Promise<any | null> {
  // Can't use object literal for duplicate keys — build URL manually
  const url = new URL(`${SMA_BASE_URL}/clients/`);
  url.searchParams.append("prof_243", phone);
  url.searchParams.append("field", "prof_239");  // firstName
  url.searchParams.append("field", "prof_241");  // lastName

  const resp = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: getAuthHeader() },
  });

  if (!resp.ok) return null;
  const result = await resp.json();
  return result.objects?.[0] ?? null;
}

/**
 * Get a client's full profile by SMA client ID.
 * Returns the profile groups array.
 */
export async function getClientProfile(clientId: number): Promise<any[]> {
  return smaGet(`/clients/${clientId}/profile/`);
}

/**
 * Get a client's preferences by SMA client ID.
 */
export async function getClientPreferences(clientId: number): Promise<any[]> {
  return smaGet(`/clients/${clientId}/preferences/`);
}

/**
 * Get a client's shell details (id, archived, type, assigned users).
 */
export async function getClientDetails(clientId: number): Promise<any> {
  return smaGet(`/clients/${clientId}/`);
}

/**
 * Get matches for a client.
 */
export async function getClientMatches(clientId: number): Promise<any> {
  return smaGet(`/clients/${clientId}/matches/`);
}

/**
 * Create a new client shell. Returns { id: number }.
 */
export async function createClient(data?: Record<string, string>): Promise<{ id: number }> {
  return smaPost("/clients/", data);
}

/**
 * Update a client's profile fields.
 */
export async function updateClientProfile(clientId: number, fields: Record<string, string>): Promise<boolean> {
  return smaPut(`/clients/${clientId}/profile/`, fields);
}

/**
 * Update a client's preference fields.
 */
export async function updateClientPreferences(clientId: number, fields: Record<string, string>): Promise<boolean> {
  return smaPut(`/clients/${clientId}/preferences/`, fields);
}
