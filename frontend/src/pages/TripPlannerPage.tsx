/**
 * Map-first trip planner shell.
 *
 * The dark basemap always fills the viewport. Planning controls float in a
 * glass panel; once a plan exists the same panel docks left and holds summary
 * plus daily logs so the map never sits beside empty chrome.
 */

import { useTripPlanner } from "../hooks/useTripPlanner";
import { TripForm } from "../components/TripForm";
import { RouteMap } from "../components/RouteMap";
import { RouteSummaryCard } from "../components/RouteSummaryCard";
import { DailyLogList } from "../components/DailyLogList";
import { ErrorBanner } from "../components/ErrorBanner";
import { formatTripCountries } from "../utils/formatTripCountries";
import { formatTimezoneName } from "../utils/formatTimezoneName";
import "./TripPlannerPage.css";

export function TripPlannerPage() {
  const { tripRequest, setTripRequest, tripPlan, loading, error, submitTrip } = useTripPlanner();
  const hasPlan = Boolean(tripPlan);
  const tripCountries = formatTripCountries([
    tripRequest.currentLocation,
    tripRequest.pickupLocation,
    tripRequest.dropoffLocation,
  ]);
  const dayCount = tripPlan?.dailyLogs.length ?? 0;
  const dayLabel = `${dayCount} day${dayCount === 1 ? "" : "s"}`;
  const logsMeta = tripCountries ? `${tripCountries}, ${dayLabel}` : dayLabel;
  const timezoneLabel = tripPlan
    ? formatTimezoneName(tripPlan.route.originTimezone)
    : null;

  return (
    <div className={`trip-planner${hasPlan ? " trip-planner--results" : ""}`}>
      <div className="trip-planner__map-stage">
        <RouteMap route={tripPlan?.route ?? null} loading={loading} />
        <div className="trip-planner__map-veil" />
      </div>

      <header className="trip-planner__brand">
        <div className="trip-planner__mark" aria-hidden="true" />
        <div className="trip-planner__brand-copy">
          <p className="trip-planner__wordmark">Spotter</p>
          <p className="trip-planner__product">HOS trip planner</p>
        </div>
      </header>

      <aside
        className={`trip-planner__panel${hasPlan ? " trip-planner__panel--docked" : " trip-planner__panel--hero"}`}
      >
        <div className="trip-planner__panel-inner">
          {!hasPlan && (
            <div className="trip-planner__intro">
              <h1>Plan a compliant run</h1>
              <p>Enter origin, pickup, and dropoff. We build the route, HOS schedule, and daily logs.</p>
            </div>
          )}

          {hasPlan && (
            <div className="trip-planner__panel-heading">
              <h2>Trip inputs</h2>
            </div>
          )}

          <TripForm
            tripRequest={tripRequest}
            setTripRequest={setTripRequest}
            submitTrip={submitTrip}
            loading={loading}
          />

          {error && <ErrorBanner message={error} />}

          {tripPlan && (
            <>
              <div className="trip-planner__summary-slot">
                <RouteSummaryCard
                  summary={tripPlan.summary}
                  timeZone={tripPlan.route.originTimezone}
                />
              </div>

              <section className="trip-planner__logs" aria-label="Daily log sheets">
                <div className="trip-planner__logs-header">
                  <div className="trip-planner__logs-header-row">
                    <h2>Daily logs</h2>
                    <p className="trip-planner__logs-meta">{logsMeta}</p>
                  </div>
                  {timezoneLabel && (
                    <p className="trip-planner__logs-timezone">
                      Timezone considered: {timezoneLabel}{" "}
                      <span>
                        (all times are measured with respect to the starting location of the
                        driver)
                      </span>
                    </p>
                  )}
                </div>
                <DailyLogList dailyLogs={tripPlan.dailyLogs} />
              </section>
            </>
          )}
        </div>
      </aside>

      <p className="trip-planner__credit">© Anas Ahmed 2026</p>
    </div>
  );
}
