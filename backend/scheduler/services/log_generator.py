"""
LogGenerator converts the flat schedule produced by HOSScheduler into the
per-day ELD sheets and overall trip summary the client displays.

Keeping this separate from HOSScheduler means the scheduling engine never
has to reason about "days" as a presentation concept - it just produces a
continuous stream of duty periods, and LogGenerator is responsible for
splitting that stream at midnight boundaries, totaling each day, and
assembling the final TripPlan. HOSScheduler has no knowledge of DailyLog,
TripSummary, or TripPlan at all - those are entirely LogGenerator's
concern.
"""

from datetime import date, datetime, time, timedelta
from typing import Dict, List

from scheduler.domain import DailyLog, RouteInfo, ScheduleEvent, TripPlan, TripSummary
from scheduler.services.enums import DutyStatus


class LogGenerator:
    """Builds a complete, presentation-ready TripPlan from a HOSScheduler's ScheduleEvents."""

    _SECONDS_PER_HOUR = 3600

    # Every DutyStatus an event might carry maps to exactly one of the four
    # totals a DailyLog tracks. Keeping this mapping in one place means a
    # new status (e.g. a future FUEL or BREAK event) only needs one line
    # added here, not a change to the totaling logic itself.
    _STATUS_TO_DAILY_LOG_FIELD = {
        DutyStatus.DRIVING: "driving_hours",
        DutyStatus.ON_DUTY: "on_duty_hours",
        DutyStatus.PICKUP: "on_duty_hours",
        DutyStatus.DROPOFF: "on_duty_hours",
        DutyStatus.FUEL: "on_duty_hours",
        DutyStatus.BREAK: "off_duty_hours",
        DutyStatus.OFF_DUTY: "off_duty_hours",
        DutyStatus.SLEEPER_BERTH: "sleeper_berth_hours",
    }

    def generate_trip_plan(self, events: List[ScheduleEvent], route_info: RouteInfo) -> TripPlan:
        """
        Convert HOSScheduler's flat, chronological ScheduleEvents into the
        complete TripPlan returned to the client.

        This is the only method the rest of the application needs to call.
        build_daily_logs() and build_trip_summary() stay public mainly
        because they are independently useful to read and test in
        isolation.
        """
        daily_logs = self.build_daily_logs(events)
        summary = self.build_trip_summary(daily_logs, route_info)
        return TripPlan(route=route_info, daily_logs=daily_logs, summary=summary)

    def build_daily_logs(self, events: List[ScheduleEvent]) -> List[DailyLog]:
        """
        Split the flat list of ScheduleEvents into one DailyLog per
        calendar day, splitting any event that crosses midnight so its
        hours are counted against both days it touches.
        """
        events_by_day: Dict[date, List[ScheduleEvent]] = {}
        for event in events:
            for day_segment in self._split_event_by_day(event):
                events_by_day.setdefault(day_segment.start_time.date(), []).append(day_segment)

        return [
            self._build_single_daily_log(log_date, day_events)
            for log_date, day_events in sorted(events_by_day.items())
        ]

    def build_trip_summary(self, daily_logs: List[DailyLog], route_info: RouteInfo) -> TripSummary:
        """
        Summarize the whole trip: distance and duration are taken directly
        from the route, while the number of days and estimated arrival are
        derived from the generated daily logs.
        """
        if not daily_logs:
            raise ValueError("Cannot build a TripSummary from an empty list of daily logs.")

        all_events = [event for daily_log in daily_logs for event in daily_log.events]

        return TripSummary(
            total_distance_miles=route_info.distance_miles,
            total_duration_hours=route_info.duration_hours,
            number_of_days=len(daily_logs),
            estimated_arrival=self._find_arrival_time(all_events),
        )

    def _split_event_by_day(self, event: ScheduleEvent) -> List[ScheduleEvent]:
        """
        Split a single event into one or more events, each confined to a
        single calendar day, so a period that crosses midnight (e.g. a
        long overnight drive) is counted against both days instead of
        being attributed entirely to the day it started on.
        """
        segments = []
        segment_start = event.start_time

        while segment_start < event.end_time:
            start_of_next_day = datetime.combine(segment_start.date() + timedelta(days=1), time.min)
            segment_end = min(event.end_time, start_of_next_day)

            segments.append(
                ScheduleEvent(
                    status=event.status,
                    start_time=segment_start,
                    end_time=segment_end,
                    location=event.location,
                    remark=event.remark,
                )
            )
            segment_start = segment_end

        return segments

    def _build_single_daily_log(self, log_date: date, events: List[ScheduleEvent]) -> DailyLog:
        """Build one DailyLog from the events that fall entirely within a single calendar day."""
        totals = {field_name: 0.0 for field_name in self._STATUS_TO_DAILY_LOG_FIELD.values()}

        for event in events:
            field_name = self._STATUS_TO_DAILY_LOG_FIELD[event.status]
            totals[field_name] += self._duration_in_hours(event)

        return DailyLog(
            log_date=log_date,
            events=events,
            driving_hours=totals["driving_hours"],
            on_duty_hours=totals["on_duty_hours"],
            off_duty_hours=totals["off_duty_hours"],
            sleeper_berth_hours=totals["sleeper_berth_hours"],
        )

    def _find_arrival_time(self, events: List[ScheduleEvent]) -> datetime:
        """
        Estimate when the driver arrives at the destination: the end of
        the last DRIVING event. Any on-duty time spent afterward (e.g.
        unloading at the dropoff location) happens after arrival, so it's
        deliberately excluded from this estimate.
        """
        driving_events = [event for event in events if event.status == DutyStatus.DRIVING]
        if not driving_events:
            raise ValueError("Cannot estimate arrival time: no driving events were found.")

        return driving_events[-1].end_time

    def _duration_in_hours(self, event: ScheduleEvent) -> float:
        """Return an event's length in hours, computed from its start and end times."""
        return (event.end_time - event.start_time).total_seconds() / self._SECONDS_PER_HOUR
