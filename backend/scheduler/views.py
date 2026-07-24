"""
Views for the scheduler app.

There is a single endpoint: POST /api/plan-trip. The view stays
intentionally thin - it validates the request, hands off to the three
services in order, and translates their result (or failure) into an HTTP
response. No scheduling or routing logic lives here.
"""

from dataclasses import asdict

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from scheduler.domain import TripRequest
from scheduler.serializers import TripRequestSerializer
from scheduler.services.hos_scheduler import HOSScheduler
from scheduler.services.log_generator import LogGenerator
from scheduler.services.route_service import RouteService, RouteServiceError


@api_view(["POST"])
def plan_trip(request):
    """
    Validate the trip request and return the generated TripPlan as JSON.

    RouteServiceError covers upstream geocoding/routing failures - reported
    as 502, since the problem is with an external service, not the request
    itself. ValueError covers a request that is well-formed but not
    schedulable (e.g. cycle hours already at the limit) - reported as 400.
    Anything else is left to propagate as a 500, since it would indicate a
    bug rather than an expected failure mode.
    """
    serializer = TripRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    trip_request = TripRequest(**serializer.validated_data)

    try:
        route_info = RouteService().build_route_info(
            trip_request.current_location,
            trip_request.pickup_location,
            trip_request.dropoff_location,
        )
        schedule_events = HOSScheduler().generate_trip_plan(trip_request, route_info)
        trip_plan = LogGenerator().generate_trip_plan(schedule_events, route_info)
    except RouteServiceError as error:
        return Response({"detail": str(error)}, status=status.HTTP_502_BAD_GATEWAY)
    except ValueError as error:
        return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

    return Response(asdict(trip_plan))
