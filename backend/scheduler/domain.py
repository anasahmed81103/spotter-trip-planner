"""
Domain objects shared across the scheduler app.

These are plain dataclasses with no Django or HTTP knowledge. They are the
common vocabulary that the serializer, RouteService, HOSScheduler,
LogGenerator, and the view all pass between each other, so the business
logic never depends on how a request arrived or how a response is sent.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Tuple

from scheduler.services.enums import DutyStatus


@dataclass
class TripRequest:
    """The validated input for a single trip-planning request."""

    current_location: str
    pickup_location: str
    dropoff_location: str
    current_cycle_used_hours: float


@dataclass
class RouteInfo:
    """Distance, duration, map geometry, and origin timezone for the route."""

    distance_miles: float
    duration_hours: float
    geometry: List[Tuple[float, float]]
    origin_timezone: str


@dataclass
class ScheduleEvent:
    """A single continuous duty-status period produced by HOSScheduler."""

    status: DutyStatus
    start_time: datetime
    end_time: datetime
    location: str
    remark: str = ""


@dataclass
class DailyLog:
    """One 24-hour ELD sheet: a day's events plus its duty-status totals."""

    log_date: date
    events: List[ScheduleEvent]
    driving_hours: float
    on_duty_hours: float
    off_duty_hours: float
    sleeper_berth_hours: float


@dataclass
class TripSummary:
    """A compact overview of the whole trip, for display above the daily logs."""

    total_distance_miles: float
    total_duration_hours: float
    number_of_days: int
    estimated_arrival: datetime


@dataclass
class TripPlan:
    """The full result returned to the client: route, daily logs, and summary."""

    route: RouteInfo
    daily_logs: List[DailyLog]
    summary: TripSummary
