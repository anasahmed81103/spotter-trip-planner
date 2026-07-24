/**
 * Minimal fetch wrapper shared by all API service modules.
 *
 * Centralizes the base URL and error handling so individual services
 * (like tripService) only need to describe which endpoint to call.
 */

export async function postJson<TResponse>(_path: string, _body: unknown): Promise<TResponse> {
  throw new Error("Not implemented");
}
