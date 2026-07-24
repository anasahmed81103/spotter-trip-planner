/**
 * Collects the four inputs needed to plan a trip as controlled inputs
 * bound to `tripRequest`, and calls `submitTrip()` once the request
 * passes validation.
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
      <ol className="trip-form__route" aria-label="Route stops">
        <li className="trip-form__field trip-form__field--stop">
          <span className="trip-form__stop-index" aria-hidden="true" />
          <div className="trip-form__field-body">
            <label htmlFor="currentLocation">Current location</label>
            <input
              id="currentLocation"
              name="currentLocation"
              type="text"
              value={tripRequest.currentLocation}
              onChange={handleTextChange("currentLocation")}
              placeholder="Dallas, TX"
              autoComplete="off"
              disabled={loading}
            />
            {errors.currentLocation && (
              <p className="trip-form__field-error" role="alert">
                {errors.currentLocation}
              </p>
            )}
          </div>
        </li>

        <li className="trip-form__field trip-form__field--stop">
          <span className="trip-form__stop-index" aria-hidden="true" />
          <div className="trip-form__field-body">
            <label htmlFor="pickupLocation">Pickup</label>
            <input
              id="pickupLocation"
              name="pickupLocation"
              type="text"
              value={tripRequest.pickupLocation}
              onChange={handleTextChange("pickupLocation")}
              placeholder="Fort Worth, TX"
              autoComplete="off"
              disabled={loading}
            />
            {errors.pickupLocation && (
              <p className="trip-form__field-error" role="alert">
                {errors.pickupLocation}
              </p>
            )}
          </div>
        </li>

        <li className="trip-form__field trip-form__field--stop">
          <span className="trip-form__stop-index trip-form__stop-index--end" aria-hidden="true" />
          <div className="trip-form__field-body">
            <label htmlFor="dropoffLocation">Dropoff</label>
            <input
              id="dropoffLocation"
              name="dropoffLocation"
              type="text"
              value={tripRequest.dropoffLocation}
              onChange={handleTextChange("dropoffLocation")}
              placeholder="Denver, CO"
              autoComplete="off"
              disabled={loading}
            />
            {errors.dropoffLocation && (
              <p className="trip-form__field-error" role="alert">
                {errors.dropoffLocation}
              </p>
            )}
          </div>
        </li>
      </ol>

      <div className="trip-form__field trip-form__field--cycle">
        <label htmlFor="currentCycleUsedHours">Cycle hours used</label>
        <div className="trip-form__cycle-row">
          <input
            id="currentCycleUsedHours"
            name="currentCycleUsedHours"
            type="number"
            step="0.1"
            min="0"
            value={tripRequest.currentCycleUsedHours}
            onChange={handleCycleHoursChange}
            placeholder="12"
            disabled={loading}
          />
          <span className="trip-form__cycle-unit">hrs</span>
        </div>
        {errors.currentCycleUsedHours && (
          <p className="trip-form__field-error" role="alert">
            {errors.currentCycleUsedHours}
          </p>
        )}
      </div>

      <div className="trip-form__actions">
        <Button label={loading ? "Planning route" : "Plan trip"} type="submit" disabled={loading} />
        {loading && <LoadingSpinner />}
      </div>
    </form>
  );
}
