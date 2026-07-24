/**
 * Compact card summarizing the trip: total distance, duration, number of
 * driving days, and estimated arrival.
 */

import type { TripSummary } from "../types/trip";
import { formatDuration } from "../utils/formatDuration";
import { formatDateTime } from "../utils/formatDateTime";
import "./RouteSummaryCard.css";

interface RouteSummaryCardProps {
  summary: TripSummary;
}

export function RouteSummaryCard({ summary }: RouteSummaryCardProps) {
  return (
    <section className="route-summary-card" aria-label="Trip summary">
      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Total Distance</span>
        <span className="route-summary-card__value">
          {summary.totalDistanceMiles.toFixed(1)} mi
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Total Duration</span>
        <span className="route-summary-card__value">
          {formatDuration(summary.totalDurationHours)}
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Driving Days</span>
        <span className="route-summary-card__value">{summary.numberOfDays}</span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Estimated Arrival</span>
        <span className="route-summary-card__value">
          {formatDateTime(summary.estimatedArrival)}
        </span>
      </div>
    </section>
  );
}
