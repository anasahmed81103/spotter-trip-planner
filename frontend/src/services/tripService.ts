/**
 * Service for calling the trip-planning endpoint.
 *
 * Keeps the API contract (URL, request/response shape) in one place so
 * components never construct fetch calls themselves. This module is also
 * the single translation layer between the frontend's camelCase domain
 * model and the backend's snake_case API contract - no other file should
 * need to know about that difference.
 */

import { postJson } from "./apiClient";
import type {
  DailyLog,
  DutyStatus,
  RouteInfo,
  ScheduleEvent,
  TripPlan,
  TripRequest,
  TripSummary,
} from "../types/trip";

/**
 * Shape of the request body expected by the backend `/plan-trip` endpoint.
 * Kept private to this file since components only ever deal with `TripRequest`.
 */
interface TripRequestApiPayload {
  current_location: string;
  pickup_location: string;
  dropoff_location: string;
  current_cycle_used_hours: number;
}

/** Converts the frontend's camelCase trip request into the backend's snake_case payload. */
function toApiPayload(request: TripRequest): TripRequestApiPayload {
  return {
    current_location: request.currentLocation,
    pickup_location: request.pickupLocation,
    dropoff_location: request.dropoffLocation,
    current_cycle_used_hours: request.currentCycleUsedHours,
  };
}

/**
 * Shapes of the JSON returned by the backend `/plan-trip` endpoint. These
 * mirror the backend's dataclasses field-for-field (snake_case) and are
 * kept private to this file - everywhere else in the app works with the
 * camelCase types from `types/trip` instead.
 */
interface RouteInfoApiResponse {
  distance_miles: number;
  duration_hours: number;
  geometry: [number, number][];
  origin_timezone: string;
  waypoints: {
    current: [number, number];
    pickup: [number, number];
    dropoff: [number, number];
  };
}

interface ScheduleEventApiResponse {
  status: DutyStatus;
  start_time: string;
  end_time: string;
  location: string;
  remark: string;
}

interface DailyLogApiResponse {
  log_date: string;
  events: ScheduleEventApiResponse[];
  driving_hours: number;
  on_duty_hours: number;
  off_duty_hours: number;
  sleeper_berth_hours: number;
}

interface TripSummaryApiResponse {
  total_distance_miles: number;
  total_duration_hours: number;
  number_of_days: number;
  estimated_arrival: string;
}

interface TripPlanApiResponse {
  route: RouteInfoApiResponse;
  daily_logs: DailyLogApiResponse[];
  summary: TripSummaryApiResponse;
}

function toRouteInfo(route: RouteInfoApiResponse): RouteInfo {
  return {
    distanceMiles: route.distance_miles,
    durationHours: route.duration_hours,
    geometry: route.geometry,
    originTimezone: route.origin_timezone,
    waypoints: {
      current: route.waypoints.current,
      pickup: route.waypoints.pickup,
      dropoff: route.waypoints.dropoff,
    },
  };
}

function toScheduleEvent(event: ScheduleEventApiResponse): ScheduleEvent {
  return {
    status: event.status,
    startTime: event.start_time,
    endTime: event.end_time,
    location: event.location,
    remark: event.remark,
  };
}

function toDailyLog(dailyLog: DailyLogApiResponse): DailyLog {
  return {
    logDate: dailyLog.log_date,
    events: dailyLog.events.map(toScheduleEvent),
    drivingHours: dailyLog.driving_hours,
    onDutyHours: dailyLog.on_duty_hours,
    offDutyHours: dailyLog.off_duty_hours,
    sleeperBerthHours: dailyLog.sleeper_berth_hours,
  };
}

function toTripSummary(summary: TripSummaryApiResponse): TripSummary {
  return {
    totalDistanceMiles: summary.total_distance_miles,
    totalDurationHours: summary.total_duration_hours,
    numberOfDays: summary.number_of_days,
    estimatedArrival: summary.estimated_arrival,
  };
}

/** Converts the backend's snake_case trip plan response into the frontend's camelCase domain model. */
function toTripPlan(response: TripPlanApiResponse): TripPlan {
  return {
    route: toRouteInfo(response.route),
    dailyLogs: response.daily_logs.map(toDailyLog),
    summary: toTripSummary(response.summary),
  };
}

export async function planTrip(request: TripRequest): Promise<TripPlan> {
  const response = await postJson<TripPlanApiResponse>("/plan-trip", toApiPayload(request));
  return toTripPlan(response);
}
