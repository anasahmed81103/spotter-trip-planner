/**
 * Minimal fetch wrapper shared by all API service modules.
 *
 * Centralizes the base URL and error handling so individual services
 * (like tripService) only need to describe which endpoint to call.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return (await response.json()) as TResponse;
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as Record<string, unknown>;

    if (typeof data.detail === "string" && data.detail.length > 0) {
      return data.detail;
    }

    // DRF reports field validation failures as { field: ["message", ...] }.
    // Surfacing those keeps the user's actual mistake visible instead of a
    // bare status code.
    const fieldMessages = Object.values(data)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    if (fieldMessages.length > 0) {
      return fieldMessages.join(" ");
    }
  } catch {
    // Response body wasn't valid JSON; fall back to the generic message below.
  }

  return `Request failed with status ${response.status}.`;
}
