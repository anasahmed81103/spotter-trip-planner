"""
Views for the scheduler app.

There is a single endpoint: POST /api/plan-trip. The view stays
intentionally thin - it validates the request, hands off to the three
services in order, and returns their combined result. No scheduling logic
lives here.
"""

from rest_framework.decorators import api_view
from rest_framework.response import Response

from scheduler.serializers import TripRequestSerializer
from scheduler.services.hos_scheduler import HOSScheduler
from scheduler.services.log_generator import LogGenerator
from scheduler.services.route_service import RouteService


@api_view(["POST"])
def plan_trip(request):
    """Validate the trip request and return the generated TripPlan as JSON."""
    raise NotImplementedError
