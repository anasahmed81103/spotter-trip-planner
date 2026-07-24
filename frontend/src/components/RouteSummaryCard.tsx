/**
 * Compact metric strip summarizing the planned trip.
 */

import type { TripSummary } from "../types/trip";
import { formatDistance } from "../utils/formatDistance";
import { formatDuration } from "../utils/formatDuration";
import { formatDateTime } from "../utils/formatDateTime";
import "./RouteSummaryCard.css";

interface RouteSummaryCardProps {
  summary: TripSummary;
  timeZone: string;
}

export function RouteSummaryCard({ summary, timeZone }: RouteSummaryCardProps) {
  return (
    <section className="route-summary-card" aria-label="Trip summary">
      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Distance</span>
        <span className="route-summary-card__value">
          {formatDistance(summary.totalDistanceMiles)}
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Drive time</span>
        <span className="route-summary-card__value">
          {formatDuration(summary.totalDurationHours)}
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Arrival</span>
        <span className="route-summary-card__value route-summary-card__value--sm">
          {formatDateTime(summary.estimatedArrival, timeZone)}
        </span>
      </div>

      <div className="route-summary-card__item">
        <span className="route-summary-card__label">Days</span>
        <span className="route-summary-card__value">{summary.numberOfDays}</span>
      </div>
    </section>
  );
}
