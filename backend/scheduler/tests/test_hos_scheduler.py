"""
Tests for HOSScheduler.

This is the one part of the app worth unit testing directly: it is pure
Python with no I/O, so tests construct TripRequest/RouteInfo objects and
assert on the resulting ScheduleEvents without any Django fixtures,
database access, or mocking.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from scheduler.domain import RouteInfo, TripRequest, Waypoints
from scheduler.services.constants import (
    MAX_CYCLE_HOURS,
    MAX_DRIVING_HOURS_PER_DAY,
    MAX_ON_DUTY_WINDOW_HOURS,
    PICKUP_DROPOFF_DURATION_HOURS,
    REQUIRED_BREAK_AFTER_DRIVING_HOURS,
)
from scheduler.services.enums import DutyStatus
from scheduler.services.hos_scheduler import HOSScheduler

# Comparing accumulated float hours needs a tolerance, but a looser one
# than the scheduler's own, since totals here sum many events.
_TOLERANCE_HOURS = 1e-6


def build_route(distance_miles: float, duration_hours: float) -> RouteInfo:
    """A RouteInfo with the given distance and duration and a minimal two-point geometry."""
    return RouteInfo(
        distance_miles=distance_miles,
        duration_hours=duration_hours,
        geometry=[(32.7767, -96.7970), (39.7392, -104.9903)],
        origin_timezone="America/Chicago",
        waypoints=Waypoints(
            current=(32.7767, -96.7970),
            pickup=(32.7555, -97.3308),
            dropoff=(39.7392, -104.9903),
        ),
    )


def build_request(current_cycle_used_hours: float = 0.0) -> TripRequest:
    """A valid TripRequest with distinct locations, varying only the cycle hours already used."""
    return TripRequest(
        current_location="Dallas, TX",
        pickup_location="Fort Worth, TX",
        dropoff_location="Denver, CO",
        current_cycle_used_hours=current_cycle_used_hours,
    )


def hours_between(event) -> float:
    """The length of a ScheduleEvent in hours."""
    return (event.end_time - event.start_time).total_seconds() / 3600


def total_hours(events, status: DutyStatus) -> float:
    """Total hours across every event carrying `status`."""
    return sum(hours_between(event) for event in events if event.status == status)


class HOSSchedulerValidationTests(SimpleTestCase):
    """Verifies HOSScheduler rejects trips it cannot legally or sensibly schedule."""

    def setUp(self):
        self.scheduler = HOSScheduler()

    def test_rejects_negative_cycle_hours(self):
        with self.assertRaises(ValueError):
            self.scheduler.generate_trip_plan(build_request(-1), build_route(300, 5))

    def test_rejects_exhausted_cycle_hours(self):
        with self.assertRaises(ValueError):
            self.scheduler.generate_trip_plan(build_request(MAX_CYCLE_HOURS), build_route(300, 5))

    def test_rejects_zero_distance_route(self):
        with self.assertRaises(ValueError):
            self.scheduler.generate_trip_plan(build_request(), build_route(0, 5))

    def test_rejects_empty_geometry(self):
        route = build_route(300, 5)
        route.geometry = []

        with self.assertRaises(ValueError):
            self.scheduler.generate_trip_plan(build_request(), route)

    def test_rejects_identical_pickup_and_dropoff(self):
        trip_request = build_request()
        trip_request.dropoff_location = " fort worth, tx "

        with self.assertRaises(ValueError):
            self.scheduler.generate_trip_plan(trip_request, build_route(300, 5))


class HOSSchedulerScheduleShapeTests(SimpleTestCase):
    """Verifies the overall structure of every schedule the engine produces."""

    def setUp(self):
        self.scheduler = HOSScheduler()

    def test_short_trip_needs_no_rest_periods(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(300, 5))

        self.assertEqual(
            [event.status for event in events],
            [DutyStatus.ON_DUTY, DutyStatus.DRIVING, DutyStatus.ON_DUTY],
        )

    def test_schedule_starts_at_current_time_in_origin_timezone(self):
        expected_start = datetime(2026, 7, 24, 12, 15, tzinfo=ZoneInfo("America/Chicago"))
        scheduler = HOSScheduler(now_provider=lambda timezone: expected_start.astimezone(timezone))

        events = scheduler.generate_trip_plan(build_request(), build_route(300, 5))

        self.assertEqual(events[0].start_time, expected_start)
        self.assertEqual(events[0].start_time.tzinfo, ZoneInfo("America/Chicago"))

    def test_elapsed_time_remains_correct_across_daylight_saving_change(self):
        # America/Chicago jumps from 01:59 CST to 03:00 CDT on this date.
        start = datetime(2026, 3, 8, 1, 30, tzinfo=ZoneInfo("America/Chicago"))
        scheduler = HOSScheduler(now_provider=lambda origin_timezone: start.astimezone(origin_timezone))

        events = scheduler.generate_trip_plan(build_request(), build_route(60, 1))
        pickup = events[0]

        elapsed = (
            pickup.end_time.astimezone(timezone.utc)
            - pickup.start_time.astimezone(timezone.utc)
        ).total_seconds() / 3600
        self.assertAlmostEqual(elapsed, PICKUP_DROPOFF_DURATION_HOURS)
        self.assertEqual(pickup.end_time.hour, 3)

    def test_events_are_contiguous_and_chronological(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(2400, 40))

        for earlier, later in zip(events, events[1:]):
            self.assertLess(earlier.start_time, earlier.end_time)
            self.assertEqual(earlier.end_time, later.start_time)

    def test_driving_hours_match_the_route_duration(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(2400, 40))

        self.assertAlmostEqual(total_hours(events, DutyStatus.DRIVING), 40, delta=_TOLERANCE_HOURS)

    def test_trip_begins_with_pickup_and_ends_with_dropoff(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(2400, 40))

        self.assertEqual(events[0].remark, "Pickup")
        self.assertEqual(events[0].status, DutyStatus.ON_DUTY)
        self.assertAlmostEqual(hours_between(events[0]), PICKUP_DROPOFF_DURATION_HOURS)

        self.assertEqual(events[-1].remark, "Dropoff")
        self.assertEqual(events[-1].status, DutyStatus.ON_DUTY)
        self.assertAlmostEqual(hours_between(events[-1]), PICKUP_DROPOFF_DURATION_HOURS)


class HOSSchedulerRuleTests(SimpleTestCase):
    """Verifies each FMCSA limit actually interrupts the schedule."""

    def setUp(self):
        self.scheduler = HOSScheduler()

    def test_long_trip_inserts_break_and_sleeper_berth(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(1200, 20))
        statuses = {event.status for event in events}

        self.assertIn(DutyStatus.BREAK, statuses)
        self.assertIn(DutyStatus.SLEEPER_BERTH, statuses)

    def test_driving_never_exceeds_daily_limit_between_resets(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(3000, 50))

        driving_today = 0.0
        for event in events:
            if event.status == DutyStatus.DRIVING:
                driving_today += hours_between(event)
                self.assertLessEqual(driving_today, MAX_DRIVING_HOURS_PER_DAY + _TOLERANCE_HOURS)
            elif event.status in (DutyStatus.SLEEPER_BERTH, DutyStatus.OFF_DUTY):
                driving_today = 0.0

    def test_never_drives_more_than_eight_hours_without_a_break(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(3000, 50))

        driving_since_break = 0.0
        for event in events:
            if event.status == DutyStatus.DRIVING:
                driving_since_break += hours_between(event)
                self.assertLessEqual(
                    driving_since_break,
                    REQUIRED_BREAK_AFTER_DRIVING_HOURS + _TOLERANCE_HOURS,
                )
            elif event.status in (DutyStatus.BREAK, DutyStatus.SLEEPER_BERTH, DutyStatus.OFF_DUTY):
                driving_since_break = 0.0

    def test_on_duty_window_is_respected(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(3000, 50))

        window_used = 0.0
        for event in events:
            if event.status in (DutyStatus.SLEEPER_BERTH, DutyStatus.OFF_DUTY):
                window_used = 0.0
                continue

            window_used += hours_between(event)
            self.assertLessEqual(window_used, MAX_ON_DUTY_WINDOW_HOURS + _TOLERANCE_HOURS)

    def test_fuel_stop_is_added_once_per_thousand_miles(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(2400, 40))
        fuel_stops = [event for event in events if event.status == DutyStatus.FUEL]

        self.assertEqual(len(fuel_stops), 2)

    def test_short_trip_needs_no_fuel_stop(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(300, 5))

        self.assertNotIn(DutyStatus.FUEL, {event.status for event in events})

    def test_exhausted_cycle_triggers_a_thirty_four_hour_restart(self):
        events = self.scheduler.generate_trip_plan(build_request(MAX_CYCLE_HOURS - 1), build_route(600, 10))
        restarts = [event for event in events if event.status == DutyStatus.OFF_DUTY]

        self.assertEqual(len(restarts), 1)
        self.assertEqual(restarts[0].remark, "34-hour restart")
        self.assertAlmostEqual(hours_between(restarts[0]), 34)

    def test_fresh_cycle_needs_no_restart(self):
        events = self.scheduler.generate_trip_plan(build_request(), build_route(600, 10))

        self.assertNotIn(DutyStatus.OFF_DUTY, {event.status for event in events})
