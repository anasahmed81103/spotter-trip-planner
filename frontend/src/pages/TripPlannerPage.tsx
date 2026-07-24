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
import "./TripPlannerPage.css";

export function TripPlannerPage() {
  const { tripRequest, setTripRequest, tripPlan, loading, error, submitTrip } = useTripPlanner();
  const hasPlan = Boolean(tripPlan);

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
                  <h2>Daily logs</h2>
                  <p>
                    {tripPlan.route.originTimezone},{" "}
                    {tripPlan.dailyLogs.length} day{tripPlan.dailyLogs.length === 1 ? "" : "s"}
                  </p>
                </div>
                <DailyLogList dailyLogs={tripPlan.dailyLogs} />
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
