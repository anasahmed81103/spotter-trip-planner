/**
 * Owns all state for the trip planner page: the in-flight request status,
 * the resulting plan, and any error message. Keeping this in a hook lets
 * TripPlannerPage stay a pure composition of components.
 */

import { useCallback, useState } from "react";
import { planTrip } from "../services/tripService";
import type { TripPlan, TripRequest } from "../types/trip";

interface UseTripPlannerResult {
  tripPlan: TripPlan | null;
  isLoading: boolean;
  error: string | null;
  submitTrip: (request: TripRequest) => Promise<void>;
}

const DEFAULT_ERROR_MESSAGE = "Something went wrong while planning the trip. Please try again.";

export function useTripPlanner(): UseTripPlannerResult {
  const [tripPlan, setTripPlan] = useState<TripPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitTrip = useCallback(async (request: TripRequest) => {
    setIsLoading(true);
    setError(null);

    try {
      const plan = await planTrip(request);
      setTripPlan(plan);
    } catch (err) {
      setTripPlan(null);
      setError(err instanceof Error ? err.message : DEFAULT_ERROR_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { tripPlan, isLoading, error, submitTrip };
}
