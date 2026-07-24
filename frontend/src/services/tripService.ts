/**
 * Service for calling the trip-planning endpoint.
 *
 * Keeps the API contract (URL, request/response shape) in one place so
 * components never construct fetch calls themselves.
 */

import { postJson } from "./apiClient";
import type { TripPlan, TripRequest } from "../types/trip";

export async function planTrip(request: TripRequest): Promise<TripPlan> {
  return postJson<TripPlan>("/plan-trip", request);
}
