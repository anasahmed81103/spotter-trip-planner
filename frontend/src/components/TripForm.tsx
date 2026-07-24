/**
 * Collects the four inputs needed to plan a trip as controlled inputs
 * bound to `tripRequest`, and calls `submitTrip()` once the request
 * passes validation. Does not call the API directly - that's submitTrip's
 * job, supplied by the caller (via useTripPlanner).
 */

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { TripRequest } from "../types/trip";
import { Button } from "./Button";
import { LoadingSpinner } from "./LoadingSpinner";
import "./TripForm.css";

interface TripFormProps {
  tripRequest: TripRequest;
  setTripRequest: (value: TripRequest | ((previous: TripRequest) => TripRequest)) => void;
  submitTrip: () => void;
  loading: boolean;
}

type TextField = "currentLocation" | "pickupLocation" | "dropoffLocation";

interface ValidationErrors {
  currentLocation?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  currentCycleUsedHours?: string;
}

const FIELD_LABELS: Record<TextField, string> = {
  currentLocation: "Current location",
  pickupLocation: "Pickup location",
  dropoffLocation: "Dropoff location",
};

function validate(tripRequest: TripRequest): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const field of Object.keys(FIELD_LABELS) as TextField[]) {
    if (!tripRequest[field].trim()) {
      errors[field] = `${FIELD_LABELS[field]} is required.`;
    }
  }

  if (tripRequest.currentCycleUsedHours < 0) {
    errors.currentCycleUsedHours = "Cycle hours used cannot be negative.";
  }

  return errors;
}

export function TripForm({ tripRequest, setTripRequest, submitTrip, loading }: TripFormProps) {
  const [errors, setErrors] = useState<ValidationErrors>({});

  function handleTextChange(field: TextField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setTripRequest((previous) => ({ ...previous, [field]: value }));
      setErrors((previous) => ({ ...previous, [field]: undefined }));
    };
  }

  function handleCycleHoursChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    setTripRequest((previous) => ({
      ...previous,
      currentCycleUsedHours: Number.isNaN(value) ? 0 : value,
    }));
    setErrors((previous) => ({ ...previous, currentCycleUsedHours: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationErrors = validate(tripRequest);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    submitTrip();
  }

  return (
    <form className="trip-form" onSubmit={handleSubmit} noValidate>
      <div className="trip-form__field">
        <label htmlFor="currentLocation">Current Location</label>
        <input
          id="currentLocation"
          name="currentLocation"
          type="text"
          value={tripRequest.currentLocation}
          onChange={handleTextChange("currentLocation")}
          placeholder="e.g. Dallas, TX"
          disabled={loading}
        />
        {errors.currentLocation && (
          <p className="trip-form__field-error" role="alert">
            {errors.currentLocation}
          </p>
        )}
      </div>

      <div className="trip-form__field">
        <label htmlFor="pickupLocation">Pickup Location</label>
        <input
          id="pickupLocation"
          name="pickupLocation"
          type="text"
          value={tripRequest.pickupLocation}
          onChange={handleTextChange("pickupLocation")}
          placeholder="e.g. Fort Worth, TX"
          disabled={loading}
        />
        {errors.pickupLocation && (
          <p className="trip-form__field-error" role="alert">
            {errors.pickupLocation}
          </p>
        )}
      </div>

      <div className="trip-form__field">
        <label htmlFor="dropoffLocation">Dropoff Location</label>
        <input
          id="dropoffLocation"
          name="dropoffLocation"
          type="text"
          value={tripRequest.dropoffLocation}
          onChange={handleTextChange("dropoffLocation")}
          placeholder="e.g. Denver, CO"
          disabled={loading}
        />
        {errors.dropoffLocation && (
          <p className="trip-form__field-error" role="alert">
            {errors.dropoffLocation}
          </p>
        )}
      </div>

      <div className="trip-form__field">
        <label htmlFor="currentCycleUsedHours">Current Cycle Hours Used</label>
        <input
          id="currentCycleUsedHours"
          name="currentCycleUsedHours"
          type="number"
          step="0.1"
          value={tripRequest.currentCycleUsedHours}
          onChange={handleCycleHoursChange}
          placeholder="e.g. 12"
          disabled={loading}
        />
        {errors.currentCycleUsedHours && (
          <p className="trip-form__field-error" role="alert">
            {errors.currentCycleUsedHours}
          </p>
        )}
      </div>

      <div className="trip-form__actions">
        <Button label="Plan Trip" type="submit" disabled={loading} />
        {loading && <LoadingSpinner />}
      </div>
    </form>
  );
}
