/**
 * Collects the four inputs needed to plan a trip and calls onSubmit with
 * a validated TripRequest.
 */

import type { TripRequest } from "../types/trip";
import "./TripForm.css";

interface TripFormProps {
  onSubmit: (request: TripRequest) => void;
  isSubmitting: boolean;
}

export function TripForm(_props: TripFormProps) {
  return null;
}
