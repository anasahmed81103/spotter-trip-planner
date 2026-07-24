/**
 * Collects the four inputs needed to plan a trip and calls onSubmit with
 * a validated TripRequest.
 */

import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { TripRequest } from "../types/trip";
import { Button } from "./Button";
import { LoadingSpinner } from "./LoadingSpinner";
import "./TripForm.css";

interface TripFormProps {
  onSubmit: (request: TripRequest) => void;
  isSubmitting: boolean;
}

interface FormState {
  currentLocation: string;
  pickupLocation: string;
  dropoffLocation: string;
  currentCycleUsedHours: string;
}

const INITIAL_STATE: FormState = {
  currentLocation: "",
  pickupLocation: "",
  dropoffLocation: "",
  currentCycleUsedHours: "",
};

export function TripForm({ onSubmit, isSubmitting }: TripFormProps) {
  const [formState, setFormState] = useState<FormState>(INITIAL_STATE);
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleChange(field: keyof FormState) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((previous) => ({ ...previous, [field]: event.target.value }));
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const currentLocation = formState.currentLocation.trim();
    const pickupLocation = formState.pickupLocation.trim();
    const dropoffLocation = formState.dropoffLocation.trim();
    const currentCycleUsedHours = Number(formState.currentCycleUsedHours);

    if (!currentLocation || !pickupLocation || !dropoffLocation) {
      setValidationError("Please fill in current, pickup, and dropoff locations.");
      return;
    }

    if (formState.currentCycleUsedHours.trim() === "" || Number.isNaN(currentCycleUsedHours)) {
      setValidationError("Please enter a valid number of cycle hours used.");
      return;
    }

    if (currentCycleUsedHours < 0 || currentCycleUsedHours > 70) {
      setValidationError("Cycle hours used must be between 0 and 70.");
      return;
    }

    setValidationError(null);
    onSubmit({
      currentLocation,
      pickupLocation,
      dropoffLocation,
      currentCycleUsedHours,
    });
  }

  return (
    <form className="trip-form" onSubmit={handleSubmit}>
      <div className="trip-form__field">
        <label htmlFor="currentLocation">Current Location</label>
        <input
          id="currentLocation"
          name="currentLocation"
          type="text"
          value={formState.currentLocation}
          onChange={handleChange("currentLocation")}
          placeholder="e.g. Dallas, TX"
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="trip-form__field">
        <label htmlFor="pickupLocation">Pickup Location</label>
        <input
          id="pickupLocation"
          name="pickupLocation"
          type="text"
          value={formState.pickupLocation}
          onChange={handleChange("pickupLocation")}
          placeholder="e.g. Fort Worth, TX"
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="trip-form__field">
        <label htmlFor="dropoffLocation">Dropoff Location</label>
        <input
          id="dropoffLocation"
          name="dropoffLocation"
          type="text"
          value={formState.dropoffLocation}
          onChange={handleChange("dropoffLocation")}
          placeholder="e.g. Denver, CO"
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="trip-form__field">
        <label htmlFor="currentCycleUsedHours">Current Cycle Hours Used</label>
        <input
          id="currentCycleUsedHours"
          name="currentCycleUsedHours"
          type="number"
          min={0}
          max={70}
          step="0.1"
          value={formState.currentCycleUsedHours}
          onChange={handleChange("currentCycleUsedHours")}
          placeholder="e.g. 12"
          disabled={isSubmitting}
          required
        />
      </div>

      {validationError && <p className="trip-form__error" role="alert">{validationError}</p>}

      <div className="trip-form__actions">
        <Button label="Plan Trip" type="submit" disabled={isSubmitting} />
        {isSubmitting && <LoadingSpinner />}
      </div>
    </form>
  );
}
