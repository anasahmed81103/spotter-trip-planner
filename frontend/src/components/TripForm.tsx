/**
 * Collects the four inputs needed to plan a trip as controlled inputs
 * bound to `tripRequest`, and calls `submitTrip()` once the request
 * passes validation.
 *
 * Location fields use LocationAutocomplete. Selected suggestions retain
 * coordinates in a local map for future routing optimizations, while the
 * plan-trip payload continues to send display-name strings only.
 */

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { LocationSuggestion } from "../types/location";
import type { TripRequest } from "../types/trip";
import { Button } from "./Button";
import { LoadingSpinner } from "./LoadingSpinner";
import { LocationAutocomplete } from "./LocationAutocomplete";
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
  // Retains lat/lng for each chosen suggestion without changing the API contract.
  const selectedLocationsRef = useRef<Partial<Record<TextField, LocationSuggestion>>>({});

  function handleLocationInputChange(field: TextField, value: string) {
    const selected = selectedLocationsRef.current[field];
    if (selected && selected.displayName !== value) {
      delete selectedLocationsRef.current[field];
    }

    setTripRequest((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function handleLocationSelect(field: TextField, location: LocationSuggestion) {
    selectedLocationsRef.current[field] = location;
    setTripRequest((previous) => ({ ...previous, [field]: location.displayName }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
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
            <LocationAutocomplete
              id="currentLocation"
              value={tripRequest.currentLocation}
              onChange={(value) => handleLocationInputChange("currentLocation", value)}
              onSelect={(location) => handleLocationSelect("currentLocation", location)}
              placeholder="Dallas, TX"
              disabled={loading}
              aria-invalid={Boolean(errors.currentLocation)}
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
            <LocationAutocomplete
              id="pickupLocation"
              value={tripRequest.pickupLocation}
              onChange={(value) => handleLocationInputChange("pickupLocation", value)}
              onSelect={(location) => handleLocationSelect("pickupLocation", location)}
              placeholder="Fort Worth, TX"
              disabled={loading}
              aria-invalid={Boolean(errors.pickupLocation)}
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
            <LocationAutocomplete
              id="dropoffLocation"
              value={tripRequest.dropoffLocation}
              onChange={(value) => handleLocationInputChange("dropoffLocation", value)}
              onSelect={(location) => handleLocationSelect("dropoffLocation", location)}
              placeholder="Denver, CO"
              disabled={loading}
              aria-invalid={Boolean(errors.dropoffLocation)}
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
