"""
HOSScheduler applies FMCSA Hours-of-Service rules to a planned trip.

Given the route's two driving legs (current→pickup and pickup→dropoff) and
how many hours are already used in the driver's current cycle, this engine
works out the ordered sequence of duty-status periods (driving, required
breaks, off-duty resets, fuel stops, pickup/dropoff time) needed to legally
complete the trip. It has no knowledge of Django, HTTP, or how its output
will be displayed - it only produces ScheduleEvent objects.

The schedule begins at the driver's current location, so the deadhead drive
to pickup is logged and governed by HOS just like the loaded leg. Every
clock (cycle, driving day, 14-hour window, break, fuel mileage) runs
continuously across both legs; nothing resets at pickup.

The rules enforced here are:
  - 11 hours of driving per duty day
  - 14-hour on-duty window, measured as elapsed time and not extended by breaks
  - 30-minute break after 8 cumulative hours of driving
  - 10 consecutive hours off duty to reset the driving day
  - 70 hours of on-duty time per 8-day cycle, cleared by a 34-hour restart
  - a fuel stop every 1000 miles
  - 1 hour on duty (not driving) at pickup and at dropoff
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Callable, List, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from scheduler.domain import RouteInfo, RouteLeg, ScheduleEvent, TripRequest
from scheduler.services.constants import (
    BREAK_DURATION_HOURS,
    CYCLE_RESTART_HOURS,
    FUEL_STOP_DURATION_HOURS,
    FUEL_STOP_INTERVAL_MILES,
    MAX_CYCLE_HOURS,
    MAX_DRIVING_HOURS_PER_DAY,
    MAX_ON_DUTY_WINDOW_HOURS,
    MIN_OFF_DUTY_RESET_HOURS,
    PICKUP_DROPOFF_DURATION_HOURS,
    REQUIRED_BREAK_AFTER_DRIVING_HOURS,
)
from scheduler.services.enums import DutyStatus

# Accumulated float hours drift by tiny amounts, so anything below this is
# treated as zero rather than scheduling a zero-length event or looping.
_TOLERANCE_HOURS = 1e-6

_EN_ROUTE = "En route"


class _StopReason(Enum):
    """Why the truck may not legally drive any further right now."""

    CYCLE_RESTART = "cycle_restart"
    DAILY_RESET = "daily_reset"
    BREAK = "break"
    FUEL = "fuel"


@dataclass
class _SchedulingState:
    """
    Mutable bookkeeping passed between the pipeline's private methods.

    This is private to HOSScheduler rather than part of domain.py: it is
    an implementation detail of how the engine builds a schedule (a
    running clock, hours consumed so far, events collected so far), not a
    concept the rest of the application needs to know about.

    remaining_* track only the leg currently being driven; the HOS clocks
    (cycle, driving day, window, break, fuel mileage) persist across both
    legs because FMCSA limits do not reset at pickup.
    """

    trip_request: TripRequest
    route_info: RouteInfo
    current_time: datetime
    remaining_distance_miles: float
    remaining_duration_hours: float
    destination_label: str
    leg_speed_mph: float
    cycle_hours_used: float
    driving_hours_today: float
    on_duty_window_hours_used: float
    driving_hours_since_break: float
    miles_since_fuel_stop: float
    events: List[ScheduleEvent]


class HOSScheduler:
    """Builds the ordered list of duty-status events required to legally drive the trip."""

    def __init__(self, now_provider: Optional[Callable[[ZoneInfo], datetime]] = None) -> None:
        """
        Accept an optional clock for deterministic tests; production uses
        datetime.now in the timezone resolved from the current location.
        """
        self._now_provider = now_provider or datetime.now

    def generate_trip_plan(self, trip_request: TripRequest, route_info: RouteInfo) -> List[ScheduleEvent]:
        """
        Run the full scheduling pipeline for a trip and return its ScheduleEvents.

        This is the only method the rest of the application calls. Its job
        is purely to sequence the steps below in order - each step owns one
        responsibility and is implemented in its own method so the pipeline
        reads as a single top-to-bottom story:

            validate inputs
                -> initialize scheduling state
                -> drive the deadhead leg to pickup (if any)
                -> add pickup event
                -> drive the loaded leg to dropoff
                -> add dropoff event
                -> finalize and return schedule

        The log therefore starts at the driver's current location, not at
        pickup, and HOS limits apply continuously across both legs.
        """
        self._validate_inputs(trip_request, route_info)
        state = self._initialize_state(trip_request, route_info)
        self._drive_leg(state, route_info.to_pickup, trip_request.pickup_location)
        self._add_pickup(state)
        self._drive_leg(state, route_info.to_dropoff, trip_request.dropoff_location)
        self._add_dropoff(state)
        return self._finalize_schedule(state)

    def _validate_inputs(self, trip_request: TripRequest, route_info: RouteInfo) -> None:
        """
        Reject trip/route combinations the scheduler cannot reason about.

        This is distinct from TripRequestSerializer's validation: the
        serializer only checks that the request is well-formed (types,
        required fields), while this checks that it is schedulable now
        that the route is known too. It only inspects trip_request and
        route_info - it never touches scheduling state or computes a
        schedule.
        """
        if trip_request.current_cycle_used_hours < 0 or trip_request.current_cycle_used_hours >= MAX_CYCLE_HOURS:
            raise ValueError(
                f"current_cycle_used_hours must be between 0 and {MAX_CYCLE_HOURS} hours, "
                f"got {trip_request.current_cycle_used_hours}."
            )

        if route_info.distance_miles <= 0:
            raise ValueError(f"Route distance must be greater than zero, got {route_info.distance_miles} miles.")

        if route_info.duration_hours <= 0:
            raise ValueError(f"Route duration must be greater than zero, got {route_info.duration_hours} hours.")

        for label, leg in (("to_pickup", route_info.to_pickup), ("to_dropoff", route_info.to_dropoff)):
            if leg.distance_miles < 0 or leg.duration_hours < 0:
                raise ValueError(f"Route leg '{label}' cannot have negative distance or duration.")

        # A leg with distance but no time (or vice versa) cannot be driven
        # at any coherent speed, so reject it rather than guessing.
        for label, leg in (("to_pickup", route_info.to_pickup), ("to_dropoff", route_info.to_dropoff)):
            has_distance = leg.distance_miles > 0
            has_duration = leg.duration_hours > 0
            if has_distance != has_duration:
                raise ValueError(
                    f"Route leg '{label}' must have both distance and duration, or neither."
                )

        if route_info.to_dropoff.duration_hours <= 0:
            raise ValueError("The pickup-to-dropoff leg must have a duration greater than zero.")

        if not route_info.geometry:
            raise ValueError("Route geometry is empty; cannot schedule a trip with no route.")

        try:
            ZoneInfo(route_info.origin_timezone)
        except ZoneInfoNotFoundError as error:
            raise ValueError(f"Unknown origin timezone '{route_info.origin_timezone}'.") from error

        if trip_request.pickup_location.strip().lower() == trip_request.dropoff_location.strip().lower():
            raise ValueError("Pickup and dropoff locations cannot be the same.")

    def _initialize_state(self, trip_request: TripRequest, route_info: RouteInfo) -> _SchedulingState:
        """
        Build the mutable state the rest of the pipeline reads from and
        adds events to: a starting clock, the remaining distance/duration
        still to be driven, the cycle hours already used, and an empty
        list of events to append to.

        This only prepares state - it does not add events, calculate
        breaks, or otherwise decide anything about the schedule. The
        clock starts at the current moment in the current location's IANA
        timezone, since nothing in TripRequest specifies an explicit trip
        start time. The driver is assumed to begin a fresh duty day with
        an empty 14-hour window.
        """
        origin_timezone = ZoneInfo(route_info.origin_timezone)

        return _SchedulingState(
            trip_request=trip_request,
            route_info=route_info,
            current_time=self._now_provider(origin_timezone),
            # Legs are loaded one at a time by _drive_leg().
            remaining_distance_miles=0.0,
            remaining_duration_hours=0.0,
            destination_label=trip_request.pickup_location,
            leg_speed_mph=route_info.distance_miles / route_info.duration_hours,
            cycle_hours_used=trip_request.current_cycle_used_hours,
            driving_hours_today=0.0,
            on_duty_window_hours_used=0.0,
            driving_hours_since_break=0.0,
            miles_since_fuel_stop=0.0,
            events=[],
        )

    def _drive_leg(self, state: _SchedulingState, leg: RouteLeg, destination_label: str) -> None:
        """
        Drive one leg of the trip to completion, inserting whatever breaks,
        resets, restarts, and fuel stops the HOS rules require along the way.

        A zero-length leg (current location is already the pickup) is
        skipped so no empty driving event is logged.
        """
        if leg.duration_hours <= _TOLERANCE_HOURS:
            return

        state.remaining_distance_miles = leg.distance_miles
        state.remaining_duration_hours = leg.duration_hours
        state.destination_label = destination_label
        # Each leg keeps its own average speed so the 1000-mile fuel rule
        # counts the miles actually covered on that leg.
        state.leg_speed_mph = leg.distance_miles / leg.duration_hours

        self._generate_driving_schedule(state)

    def _add_pickup(self, state: _SchedulingState) -> None:
        """
        Record the on-duty (not driving) period spent at the pickup
        location, and advance the state's clock past it.

        Pickup always takes a fixed PICKUP_DROPOFF_DURATION_HOURS and is
        logged as On Duty (Not Driving) - it does not touch the remaining
        distance/duration to drive, only the clock, the 14-hour window,
        and cycle hours used.
        """
        self._ensure_on_duty_capacity(state, PICKUP_DROPOFF_DURATION_HOURS)
        self._record_on_duty(
            state,
            hours=PICKUP_DROPOFF_DURATION_HOURS,
            location=state.trip_request.pickup_location,
            remark="Pickup",
        )

    def _generate_driving_schedule(self, state: _SchedulingState) -> None:
        """
        The core of the engine: turn the current leg's remaining drive time
        into a sequence of driving / break / off-duty-reset / fuel-stop
        events until the driver reaches that leg's destination.

        Each pass either inserts the stop that is currently blocking the
        driver, or drives forward until the next limit is reached. Both
        branches always advance the clock, so the loop terminates once
        the remaining leg duration is exhausted.
        """
        while state.remaining_duration_hours > _TOLERANCE_HOURS:
            blocking_stop = self._next_required_stop(state)

            if blocking_stop is None:
                self._drive_until_next_required_stop(state)
            else:
                self._take_stop(state, blocking_stop)

    def _next_required_stop(self, state: _SchedulingState) -> Optional[_StopReason]:
        """
        Return the stop the driver must take before driving again, or None
        if driving may continue right now.

        The checks are ordered by how much they cost the driver: an
        exhausted cycle needs a 34-hour restart, an exhausted driving day
        or on-duty window needs 10 hours off, a driving stretch of 8 hours
        needs a 30-minute break, and 1000 miles needs fuel. The thresholds
        mirror _calculate_next_driving_limit() exactly, so whenever that
        method returns zero this one names the reason.
        """
        if MAX_CYCLE_HOURS - state.cycle_hours_used <= _TOLERANCE_HOURS:
            return _StopReason.CYCLE_RESTART

        driving_day_exhausted = MAX_DRIVING_HOURS_PER_DAY - state.driving_hours_today <= _TOLERANCE_HOURS
        window_exhausted = MAX_ON_DUTY_WINDOW_HOURS - state.on_duty_window_hours_used <= _TOLERANCE_HOURS
        if driving_day_exhausted or window_exhausted:
            return _StopReason.DAILY_RESET

        if REQUIRED_BREAK_AFTER_DRIVING_HOURS - state.driving_hours_since_break <= _TOLERANCE_HOURS:
            return _StopReason.BREAK

        if self._hours_until_fuel_stop(state) <= _TOLERANCE_HOURS:
            return _StopReason.FUEL

        return None

    def _take_stop(self, state: _SchedulingState, reason: _StopReason) -> None:
        """Insert the rest or service period named by `reason` and reset the clocks it clears."""
        if reason is _StopReason.CYCLE_RESTART:
            self._take_cycle_restart(state)
        elif reason is _StopReason.DAILY_RESET:
            self._take_daily_reset(state)
        elif reason is _StopReason.BREAK:
            self._take_thirty_minute_break(state)
        else:
            self._take_fuel_stop(state)

    def _drive_until_next_required_stop(self, state: _SchedulingState) -> None:
        """
        Drive the truck forward until something legally or physically
        requires it to stop, then record that driving as a ScheduleEvent
        and update every clock the driving consumed.

        The caller guarantees there is driving time available, so the
        segment is always longer than zero.
        """
        driving_hours = self._calculate_next_driving_limit(state)
        driving_miles = min(driving_hours * self._average_speed_mph(state), state.remaining_distance_miles)

        self._record_event(
            state,
            status=DutyStatus.DRIVING,
            hours=driving_hours,
            location=state.destination_label,
            remark="Driving",
        )

        state.remaining_duration_hours = max(state.remaining_duration_hours - driving_hours, 0.0)
        state.remaining_distance_miles = max(state.remaining_distance_miles - driving_miles, 0.0)
        state.driving_hours_today += driving_hours
        state.driving_hours_since_break += driving_hours
        state.on_duty_window_hours_used += driving_hours
        state.cycle_hours_used += driving_hours
        state.miles_since_fuel_stop += driving_miles

    def _calculate_next_driving_limit(self, state: _SchedulingState) -> float:
        """
        Determine how many hours the truck may legally drive before it
        must stop, given everything currently known about its state: the
        smallest of the remaining trip, the remaining 11-hour driving
        allowance, the remaining 14-hour window, the time left before a
        30-minute break is due, the remaining cycle hours, and the time
        left before the next fuel stop.
        """
        return min(
            state.remaining_duration_hours,
            MAX_DRIVING_HOURS_PER_DAY - state.driving_hours_today,
            MAX_ON_DUTY_WINDOW_HOURS - state.on_duty_window_hours_used,
            REQUIRED_BREAK_AFTER_DRIVING_HOURS - state.driving_hours_since_break,
            MAX_CYCLE_HOURS - state.cycle_hours_used,
            self._hours_until_fuel_stop(state),
        )

    def _hours_until_fuel_stop(self, state: _SchedulingState) -> float:
        """Convert the miles left before the next fuel stop into driving hours."""
        miles_remaining = FUEL_STOP_INTERVAL_MILES - state.miles_since_fuel_stop
        return max(miles_remaining, 0.0) / self._average_speed_mph(state)

    def _average_speed_mph(self, state: _SchedulingState) -> float:
        """
        The current leg's average speed, used to convert between the mileage
        the fuel rule counts and the hours every other rule counts. Every
        leg that gets driven is guaranteed a positive distance and duration
        by _validate_inputs().
        """
        return state.leg_speed_mph

    def _take_thirty_minute_break(self, state: _SchedulingState) -> None:
        """
        Record the 30-minute break required after 8 cumulative hours of
        driving. It is off-duty time, so it does not add to the cycle, but
        it does burn elapsed time inside the 14-hour window.
        """
        self._record_event(
            state,
            status=DutyStatus.BREAK,
            hours=BREAK_DURATION_HOURS,
            location=_EN_ROUTE,
            remark="30-minute break",
        )

        state.on_duty_window_hours_used += BREAK_DURATION_HOURS
        state.driving_hours_since_break = 0.0

    def _take_daily_reset(self, state: _SchedulingState) -> None:
        """
        Record the 10 consecutive hours off duty that reset the driving
        day, logged in the sleeper berth as a long-haul driver would.
        It clears the driving day, the on-duty window, and the break
        clock, but not the 70-hour cycle.
        """
        self._record_event(
            state,
            status=DutyStatus.SLEEPER_BERTH,
            hours=MIN_OFF_DUTY_RESET_HOURS,
            location=_EN_ROUTE,
            remark="10-hour reset",
        )

        state.driving_hours_today = 0.0
        state.on_duty_window_hours_used = 0.0
        state.driving_hours_since_break = 0.0

    def _take_cycle_restart(self, state: _SchedulingState) -> None:
        """
        Record the 34-hour restart taken once the 70-hour cycle is spent.
        This is the only stop that clears the cycle, and it necessarily
        resets the daily clocks along with it.
        """
        self._record_event(
            state,
            status=DutyStatus.OFF_DUTY,
            hours=CYCLE_RESTART_HOURS,
            location=_EN_ROUTE,
            remark="34-hour restart",
        )

        state.cycle_hours_used = 0.0
        state.driving_hours_today = 0.0
        state.on_duty_window_hours_used = 0.0
        state.driving_hours_since_break = 0.0

    def _take_fuel_stop(self, state: _SchedulingState) -> None:
        """Record a fueling stop, which is on-duty (not driving) time, and reset the mileage counter."""
        self._record_event(
            state,
            status=DutyStatus.FUEL,
            hours=FUEL_STOP_DURATION_HOURS,
            location=_EN_ROUTE,
            remark="Fuel stop",
        )

        state.on_duty_window_hours_used += FUEL_STOP_DURATION_HOURS
        state.cycle_hours_used += FUEL_STOP_DURATION_HOURS
        state.miles_since_fuel_stop = 0.0

    def _add_dropoff(self, state: _SchedulingState) -> None:
        """
        Record the on-duty (not driving) period spent at the dropoff
        location once driving is complete.

        Mirrors _add_pickup(): dropoff always takes a fixed
        PICKUP_DROPOFF_DURATION_HOURS and is logged as On Duty (Not
        Driving), starting immediately after the driving event ends. It
        only advances the clock, the window, and cycle hours used -
        remaining distance/duration are already zero by this point.
        """
        self._ensure_on_duty_capacity(state, PICKUP_DROPOFF_DURATION_HOURS)
        self._record_on_duty(
            state,
            hours=PICKUP_DROPOFF_DURATION_HOURS,
            location=state.trip_request.dropoff_location,
            remark="Dropoff",
        )

    def _ensure_on_duty_capacity(self, state: _SchedulingState, hours: float) -> None:
        """
        Insert the rest needed before `hours` of on-duty work would breach
        the cycle or the 14-hour window. Loading and unloading are subject
        to the same limits as driving, so pickup and dropoff cannot simply
        be appended to a spent duty day.
        """
        if state.cycle_hours_used + hours > MAX_CYCLE_HOURS + _TOLERANCE_HOURS:
            self._take_cycle_restart(state)
        elif state.on_duty_window_hours_used + hours > MAX_ON_DUTY_WINDOW_HOURS + _TOLERANCE_HOURS:
            self._take_daily_reset(state)

    def _record_on_duty(self, state: _SchedulingState, hours: float, location: str, remark: str) -> None:
        """Record an On Duty (Not Driving) period and charge it to the window and the cycle."""
        self._record_event(state, status=DutyStatus.ON_DUTY, hours=hours, location=location, remark=remark)

        state.on_duty_window_hours_used += hours
        state.cycle_hours_used += hours

    def _record_event(
        self,
        state: _SchedulingState,
        status: DutyStatus,
        hours: float,
        location: str,
        remark: str,
    ) -> None:
        """
        Append one duty period to the schedule and advance the clock past
        it. Every event in the schedule is created here, which is what
        keeps the periods contiguous: each one starts exactly where the
        previous one ended.
        """
        start_time = state.current_time
        # Advance on the UTC timeline, then convert back to origin local
        # time. Direct arithmetic on a ZoneInfo datetime uses wall-clock
        # arithmetic and can lose or gain an hour across DST transitions.
        end_time = (
            start_time.astimezone(timezone.utc)
            + timedelta(hours=hours)
        ).astimezone(start_time.tzinfo)

        state.events.append(
            ScheduleEvent(
                status=status,
                start_time=start_time,
                end_time=end_time,
                location=location,
                remark=remark,
            )
        )

        state.current_time = end_time

    def _finalize_schedule(self, state: _SchedulingState) -> List[ScheduleEvent]:
        """
        Return the events accumulated during scheduling, in the
        chronological order they were added.

        Deliberately small: splitting events into per-day DailyLogs and
        computing trip-level summaries is LogGenerator's job, not
        HOSScheduler's - this method only hands back the raw events.
        """
        return state.events
