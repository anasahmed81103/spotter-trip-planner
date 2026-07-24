"""
HOSScheduler applies FMCSA Hours-of-Service rules to a planned trip.

Given the route's distance and duration, and how many hours are already
used in the driver's current cycle, this engine works out the ordered
sequence of duty-status periods (driving, required breaks, off-duty
resets, fuel stops, pickup/dropoff time) needed to legally complete the
trip. It has no knowledge of Django, HTTP, or how its output will be
displayed - it only produces ScheduleEvent objects.

The FMCSA rules themselves are not implemented yet. This file only lays
out the pipeline they will plug into, one private method per
responsibility, so the engine can be built up one rule at a time without
reshaping its structure later.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List

from scheduler.domain import RouteInfo, ScheduleEvent, TripRequest
from scheduler.services.constants import MAX_CYCLE_HOURS, PICKUP_DROPOFF_DURATION_HOURS
from scheduler.services.enums import DutyStatus


@dataclass
class _SchedulingState:
    """
    Mutable bookkeeping passed between the pipeline's private methods.

    This is private to HOSScheduler rather than part of domain.py: it is
    an implementation detail of how the engine builds a schedule (a
    running clock, hours consumed so far, events collected so far), not a
    concept the rest of the application needs to know about.
    """

    trip_request: TripRequest
    route_info: RouteInfo
    current_time: datetime
    remaining_distance_miles: float
    remaining_duration_hours: float
    cycle_hours_used: float
    events: List[ScheduleEvent]


class HOSScheduler:
    """Builds the ordered list of duty-status events required to legally drive the trip."""

    def generate_trip_plan(self, trip_request: TripRequest, route_info: RouteInfo) -> List[ScheduleEvent]:
        """
        Run the full scheduling pipeline for a trip and return its ScheduleEvents.

        This is the only method the rest of the application calls. Its job
        is purely to sequence the steps below in order - each step owns one
        responsibility and is implemented (or, for now, stubbed) in its own
        method so the pipeline reads as a single top-to-bottom story:

            validate inputs
                -> initialize scheduling state
                -> add pickup event
                -> generate driving schedule
                -> add dropoff event
                -> finalize and return schedule
        """
        self._validate_inputs(trip_request, route_info)
        state = self._initialize_state(trip_request, route_info)
        self._add_pickup(state)
        self._generate_driving_schedule(state)
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

        if not route_info.geometry:
            raise ValueError("Route geometry is empty; cannot schedule a trip with no route.")

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
        clock starts at the current moment, since nothing in TripRequest
        specifies an explicit trip-start time.
        """
        return _SchedulingState(
            trip_request=trip_request,
            route_info=route_info,
            current_time=datetime.now(),
            remaining_distance_miles=route_info.distance_miles,
            remaining_duration_hours=route_info.duration_hours,
            cycle_hours_used=trip_request.current_cycle_used_hours,
            events=[],
        )

    def _add_pickup(self, state: _SchedulingState) -> None:
        """
        Record the on-duty (not driving) period spent at the pickup
        location before driving begins, and advance the state's clock
        past it.

        Pickup always takes a fixed PICKUP_DROPOFF_DURATION_HOURS and is
        logged as On Duty (Not Driving) - it does not touch the remaining
        distance/duration to drive, only the clock and cycle hours used.
        """
        pickup_start = state.current_time
        pickup_end = pickup_start + timedelta(hours=PICKUP_DROPOFF_DURATION_HOURS)

        state.events.append(
            ScheduleEvent(
                status=DutyStatus.ON_DUTY,
                start_time=pickup_start,
                end_time=pickup_end,
                location=state.trip_request.pickup_location,
                remark="Pickup",
            )
        )

        state.current_time = pickup_end
        state.cycle_hours_used += PICKUP_DROPOFF_DURATION_HOURS

    def _generate_driving_schedule(self, state: _SchedulingState) -> None:
        """
        The core of the engine: turn the remaining drive time into a
        sequence of driving / break / off-duty-reset / fuel-stop events
        until the driver reaches the dropoff location. Every FMCSA rule in
        constants.py will eventually be applied here.
        """
        raise NotImplementedError

    def _add_dropoff(self, state: _SchedulingState) -> None:
        """
        Record the on-duty (not driving) period spent at the dropoff
        location once driving is complete.
        """
        raise NotImplementedError

    def _finalize_schedule(self, state: _SchedulingState) -> List[ScheduleEvent]:
        """
        Return the collected events in chronological order. Also the future
        home of any end-of-pipeline consistency checks (e.g. verifying
        events don't overlap) before handing the schedule to LogGenerator.
        """
        raise NotImplementedError
