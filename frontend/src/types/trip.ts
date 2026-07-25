/**
 * Shared TypeScript types for trip planning data.
 *
 * These mirror the backend's domain dataclasses field-for-field so the
 * API response can be typed directly without a separate mapping layer.
 */

export type DutyStatus =
  | "off_duty"
  | "sleeper_berth"
  | "driving"
  | "on_duty"
  | "break"
  | "fuel"
  | "pickup"
  | "dropoff";

export interface TripRequest {
  currentLocation: string;
  pickupLocation: string;
  dropoffLocation: string;
  currentCycleUsedHours: number;
}

export interface Waypoints {
  current: [number, number];
  pickup: [number, number];
  dropoff: [number, number];
}

export interface RouteInfo {
  distanceMiles: number;
  durationHours: number;
  geometry: [number, number][];
  originTimezone: string;
  waypoints: Waypoints;
}

export interface ScheduleEvent {
  status: DutyStatus;
  startTime: string;
  endTime: string;
  location: string;
  remark: string;
}

export interface DailyLog {
  logDate: string;
  events: ScheduleEvent[];
  drivingHours: number;
  onDutyHours: number;
  offDutyHours: number;
  sleeperBerthHours: number;
}

export interface TripSummary {
  totalDistanceMiles: number;
  totalDurationHours: number;
  numberOfDays: number;
  estimatedArrival: string;
}

export interface TripPlan {
  route: RouteInfo;
  dailyLogs: DailyLog[];
  summary: TripSummary;
}
