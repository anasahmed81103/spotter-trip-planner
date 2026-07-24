/**
 * Owns all state for the trip planner page: the in-progress trip request,
 * the in-flight request status, the resulting plan, and any error message.
 *
 * Framework-agnostic aside from React's state hooks - it only talks to
 * tripService, so it has no knowledge of JSX, DOM events, or styling.
 */

import { useCallback, useRef, useState } from "react";
import { planTrip } from "../services/tripService";
import type { TripPlan, TripRequest } from "../types/trip";

const INITIAL_TRIP_REQUEST: TripRequest = {
  currentLocation: "",
  pickupLocation: "",
  dropoffLocation: "",
  currentCycleUsedHours: 0,
};

const DEFAULT_ERROR_MESSAGE = "Something went wrong while planning the trip. Please try again.";

interface UseTripPlannerResult {
  /**
   * The trip request currently being built/edited. Starts out as empty
   * locations and zero cycle hours used.
   */
  tripRequest: TripRequest;

  /**
   * Updates `tripRequest`. Accepts either a new `TripRequest` or an updater
   * function that receives the previous request, mirroring React's
   * `useState` setter so it can be wired directly into controlled inputs.
   */
  setTripRequest: (value: TripRequest | ((previous: TripRequest) => TripRequest)) => void;

  /**
   * The most recently generated trip plan, or `null` if no request has
   * succeeded yet (including before the first submission, and after a
   * failed submission, which clears any previous plan).
   */
  tripPlan: TripPlan | null;

  /** `true` while a submitTrip() call is awaiting the API response. */
  loading: boolean;

  /**
   * A user-facing message describing why the last submitTrip() call
   * failed, or `null` if there is no error (including before the first
   * submission, and after a successful one, which clears any previous
   * error).
   */
  error: string | null;

  /**
   * Submits the current `tripRequest` to `tripService.planTrip`. Sets
   * `loading` for the duration of the call, and on completion updates
   * either `tripPlan` (on success) or `error` (on failure), clearing the
   * other.
   */
  submitTrip: () => Promise<void>;
}

export function useTripPlanner(): UseTripPlannerResult {
  const [tripRequest, setTripRequestState] = useState<TripRequest>(INITIAL_TRIP_REQUEST);
  // Mirrors `tripRequest` synchronously so submitTrip() can read the latest
  // value even when called immediately after setTripRequest(), before
  // React has re-rendered with the new state.
  const tripRequestRef = useRef<TripRequest>(INITIAL_TRIP_REQUEST);

  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setTripRequest = useCallback(
    (value: TripRequest | ((previous: TripRequest) => TripRequest)) => {
      const resolved =
        typeof value === "function"
          ? (value as (previous: TripRequest) => TripRequest)(tripRequestRef.current)
          : value;
      tripRequestRef.current = resolved;
      setTripRequestState(resolved);
    },
    [],
  );

  const submitTrip = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const plan = await planTrip(tripRequestRef.current);
      setTripPlan(plan);
    } catch (err) {
      setTripPlan(null);
      setError(err instanceof Error ? err.message : DEFAULT_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, []);

  return { tripRequest, setTripRequest, tripPlan, loading, error, submitTrip };
}
