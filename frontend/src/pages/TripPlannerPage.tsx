/**
 * The app's single page: hosts the trip form and, once a plan has been
 * generated, the route summary, map, and daily logs.
 *
 * All state lives in useTripPlanner() - this component is only responsible
 * for composing the layout from already-scaffolded components.
 */

import { useTripPlanner } from "../hooks/useTripPlanner";
import { TripForm } from "../components/TripForm";
import { RouteMap } from "../components/RouteMap";
import { RouteSummaryCard } from "../components/RouteSummaryCard";
import { DailyLogList } from "../components/DailyLogList";
import { ErrorBanner } from "../components/ErrorBanner";
import "./TripPlannerPage.css";

export function TripPlannerPage() {
  const { tripPlan, isLoading, error, submitTrip } = useTripPlanner();

  return (
    <div className="trip-planner-page">
      <header className="trip-planner-page__header">
        <h1>HOS Trip Planner</h1>
      </header>

      <div className="trip-planner-page__main">
        <section className="trip-planner-page__form">
          <TripForm onSubmit={submitTrip} isSubmitting={isLoading} />
          {error && <ErrorBanner message={error} />}
        </section>

        <section className="trip-planner-page__map">
          {tripPlan && <RouteMap route={tripPlan.route} />}
        </section>
      </div>

      {tripPlan && (
        <section className="trip-planner-page__summary">
          <RouteSummaryCard summary={tripPlan.summary} />
        </section>
      )}

      {tripPlan && (
        <section className="trip-planner-page__logs">
          <DailyLogList dailyLogs={tripPlan.dailyLogs} />
        </section>
      )}
    </div>
  );
}
