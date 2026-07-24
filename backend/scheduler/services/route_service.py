"""
RouteService resolves a trip's locations into an actual driving route.

This is the only module in the app that talks to external APIs. It hides
both the geocoding provider (Nominatim) and the routing provider (OSRM)
behind a single public method, so the rest of the application only ever
deals with a RouteInfo object and never needs to know which provider
produced it.
"""

from scheduler.domain import RouteInfo, TripRequest


class RouteService:
    """Builds a RouteInfo from a TripRequest using free OSM-based APIs."""

    def build_route_info(self, trip_request: TripRequest) -> RouteInfo:
        """Resolve the trip's locations to coordinates and fetch the route between them."""
        raise NotImplementedError
