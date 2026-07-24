"""
LogGenerator converts the flat schedule produced by HOSScheduler into the
per-day ELD sheets and overall trip summary the client displays.

Keeping this separate from HOSScheduler means the scheduling engine never
has to reason about "days" as a presentation concept - it just produces a
continuous stream of duty periods, and LogGenerator is responsible for
splitting that stream at midnight boundaries and totaling each day.
"""

from typing import List

from scheduler.domain import DailyLog, RouteInfo, ScheduleEvent, TripSummary


class LogGenerator:
    """Builds DailyLogs and a TripSummary from a HOSScheduler's ScheduleEvents."""

    def build_daily_logs(self, events: List[ScheduleEvent]) -> List[DailyLog]:
        """Split events at midnight boundaries into one DailyLog per calendar day."""
        raise NotImplementedError

    def build_trip_summary(self, daily_logs: List[DailyLog], route_info: RouteInfo) -> TripSummary:
        """Aggregate the daily logs and route into a single trip-level summary."""
        raise NotImplementedError
