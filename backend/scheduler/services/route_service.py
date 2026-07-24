"""
RouteService resolves a trip's locations into an actual driving route.

This is the only module in the app that talks to external APIs. It hides
both the geocoding provider (Nominatim) and the routing provider (OSRM)
behind a single public method, so the rest of the application only ever
deals with a RouteInfo object and never needs to know which provider
produced it, what shape its JSON took, or how units were converted.
"""

import os
from typing import List, Tuple

import requests

from scheduler.domain import RouteInfo

# Public OSM-community-run servers, free to use for development. A
# production deployment would point these at self-hosted or paid
# instances via the environment instead of changing any code here.
_DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org"
_DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org"


class RouteServiceError(Exception):
    """Base exception for failures while resolving a trip's route."""


class GeocodingError(RouteServiceError):
    """Raised when a location's coordinates could not be resolved via Nominatim."""


class RoutingError(RouteServiceError):
    """Raised when OSRM could not compute a driving route between coordinates."""


class RouteService:
    """Builds a RouteInfo from three locations using free OSM-based APIs."""

    # Nominatim's usage policy requires a descriptive, non-generic User-Agent.
    _USER_AGENT = "hos-trip-planner-assessment/1.0"
    _REQUEST_TIMEOUT_SECONDS = 10

    _METERS_PER_MILE = 1609.344
    _SECONDS_PER_HOUR = 3600

    def __init__(self) -> None:
        # Read once per instance rather than per-request, and read from the
        # environment (not Django settings) so this service stays usable
        # outside of Django too.
        self._osrm_base_url = os.environ.get("OSRM_BASE_URL", _DEFAULT_OSRM_BASE_URL)
        self._nominatim_base_url = os.environ.get("NOMINATIM_BASE_URL", _DEFAULT_NOMINATIM_BASE_URL)

    def build_route_info(self, current_location: str, pickup_location: str, dropoff_location: str) -> RouteInfo:
        """
        Geocode the three locations and fetch the driving route that
        visits them in order (current -> pickup -> dropoff).

        This is the only method the rest of the application should call -
        everything else in this class is a private implementation detail.
        """
        current_coordinates = self._geocode_location(current_location)
        pickup_coordinates = self._geocode_location(pickup_location)
        dropoff_coordinates = self._geocode_location(dropoff_location)

        route = self._request_route([current_coordinates, pickup_coordinates, dropoff_coordinates])

        return RouteInfo(
            distance_miles=self._convert_distance_to_miles(route["distance"]),
            duration_hours=self._convert_duration_to_hours(route["duration"]),
            # OSRM's GeoJSON geometry is (longitude, latitude); Leaflet
            # expects (latitude, longitude), so the pair order is flipped
            # here rather than leaking OSRM's convention to the frontend.
            geometry=[(latitude, longitude) for longitude, latitude in route["geometry"]["coordinates"]],
        )

    def _geocode_location(self, location: str) -> Tuple[float, float]:
        """
        Resolve a free-text location (e.g. "Chicago, IL") to a single
        (latitude, longitude) pair via Nominatim.

        Only the single best match is requested (limit=1) since the
        scheduler just needs one representative point per location, not a
        list of candidates for the user to choose between.
        """
        try:
            response = requests.get(
                f"{self._nominatim_base_url}/search",
                params={"q": location, "format": "json", "limit": 1},
                headers={"User-Agent": self._USER_AGENT},
                timeout=self._REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as error:
            raise GeocodingError(f"Could not reach Nominatim to geocode '{location}': {error}") from error

        if not response.ok:
            raise GeocodingError(
                f"Nominatim returned status {response.status_code} while geocoding '{location}'."
            )

        results = response.json()
        if not results:
            raise GeocodingError(f"No coordinates found for location '{location}'.")

        return float(results[0]["lat"]), float(results[0]["lon"])

    def _request_route(self, coordinates: List[Tuple[float, float]]) -> dict:
        """
        Request a driving route through the given (latitude, longitude)
        waypoints, in order, from OSRM. Returns OSRM's first route object
        as-is; callers within this class extract the fields they need from
        it, but it never leaves the service.

        OSRM expects waypoints as "longitude,latitude" pairs joined by
        semicolons in the URL path.
        """
        waypoints = ";".join(f"{longitude},{latitude}" for latitude, longitude in coordinates)

        try:
            response = requests.get(
                f"{self._osrm_base_url}/route/v1/driving/{waypoints}",
                params={"overview": "full", "geometries": "geojson"},
                timeout=self._REQUEST_TIMEOUT_SECONDS,
            )
        except requests.RequestException as error:
            raise RoutingError(f"Could not reach OSRM to compute a route: {error}") from error

        if not response.ok:
            raise RoutingError(f"OSRM returned status {response.status_code} while computing a route.")

        route_response = response.json()
        if route_response.get("code") != "Ok" or not route_response.get("routes"):
            message = route_response.get("message", "no route was returned")
            raise RoutingError(f"OSRM could not compute a route: {message}.")

        return route_response["routes"][0]

    def _convert_distance_to_miles(self, meters: float) -> float:
        """OSRM reports distance in meters; the app displays and schedules in miles."""
        return meters / self._METERS_PER_MILE

    def _convert_duration_to_hours(self, seconds: float) -> float:
        """OSRM reports duration in seconds; the app displays and schedules in hours."""
        return seconds / self._SECONDS_PER_HOUR
