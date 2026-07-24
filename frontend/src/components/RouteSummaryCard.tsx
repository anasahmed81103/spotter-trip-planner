/**
 * Read-only card summarizing the trip: total distance, driving duration,
 * estimated arrival, and number of days. Purely presentational - all
 * values come from `summary` as-is, formatted for display via shared
 * helpers, with no calculation or derivation happening here.
 */

import type { TripSummary } from "../types/trip";
import { formatDistance } from "../utils/formatDistance";
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
          {formatDistance(summary.totalDistanceMiles)}
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Driving Duration</span>
        <span className="route-summary-card__value">
          {formatDuration(summary.totalDurationHours)}
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Estimated Arrival</span>
        <span className="route-summary-card__value">
          {formatDateTime(summary.estimatedArrival)}
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Number of Days</span>
        <span className="route-summary-card__value">{summary.numberOfDays}</span>
      </div>
    </section>
  );
}
