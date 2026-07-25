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
from timezonefinder import TimezoneFinder

from scheduler.domain import RouteInfo, RouteLeg, Waypoints

# Public OSM-community-run servers, free to use for development. A
# production deployment would point these at self-hosted or paid
# instances via the environment instead of changing any code here.
_DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org"
_DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org"
_TIMEZONE_FINDER = TimezoneFinder(in_memory=True)

# Coordinates closer than this are treated as the same stop so OSRM is
# not asked for a zero-length current→pickup leg.
_SAME_POINT_EPSILON_DEGREES = 1e-4


class RouteServiceError(Exception):
    """Base exception for failures while resolving a trip's route."""


class GeocodingError(RouteServiceError):
    """Raised when a location's coordinates could not be resolved via Nominatim."""


class RoutingError(RouteServiceError):
    """Raised when OSRM could not compute a driving route between coordinates."""


class TimezoneLookupError(RouteServiceError):
    """Raised when the current location's coordinates cannot be mapped to a timezone."""


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

        OSRM's per-leg distances/durations become to_pickup / to_dropoff so
        the scheduler can log deadhead driving before loading, not only the
        loaded leg after pickup.
        """
        current_coordinates = self._geocode_location(current_location)
        pickup_coordinates = self._geocode_location(pickup_location)
        dropoff_coordinates = self._geocode_location(dropoff_location)
        origin_timezone = self._find_timezone(current_coordinates)

        to_pickup, to_dropoff, geometry = self._build_legs_and_geometry(
            current_coordinates,
            pickup_coordinates,
            dropoff_coordinates,
        )

        return RouteInfo(
            distance_miles=to_pickup.distance_miles + to_dropoff.distance_miles,
            duration_hours=to_pickup.duration_hours + to_dropoff.duration_hours,
            geometry=geometry,
            origin_timezone=origin_timezone,
            waypoints=Waypoints(
                current=current_coordinates,
                pickup=pickup_coordinates,
                dropoff=dropoff_coordinates,
            ),
            to_pickup=to_pickup,
            to_dropoff=to_dropoff,
        )

    def _build_legs_and_geometry(
        self,
        current_coordinates: Tuple[float, float],
        pickup_coordinates: Tuple[float, float],
        dropoff_coordinates: Tuple[float, float],
    ) -> Tuple[RouteLeg, RouteLeg, List[Tuple[float, float]]]:
        """
        Build the two driving legs and the continuous map polyline.

        When current and pickup resolve to the same point, there is no
        deadhead: to_pickup is zero and only pickup→dropoff is routed.
        """
        if self._coordinates_nearly_equal(current_coordinates, pickup_coordinates):
            route = self._request_route([pickup_coordinates, dropoff_coordinates])
            to_pickup = RouteLeg(distance_miles=0.0, duration_hours=0.0)
            to_dropoff = self._leg_from_osrm(route["legs"][0])
            geometry = self._geometry_from_osrm(route)
            return to_pickup, to_dropoff, geometry

        route = self._request_route([current_coordinates, pickup_coordinates, dropoff_coordinates])
        if len(route.get("legs", [])) != 2:
            raise RoutingError(
                f"OSRM returned {len(route.get('legs', []))} legs for a three-stop trip; expected 2."
            )

        to_pickup = self._leg_from_osrm(route["legs"][0])
        to_dropoff = self._leg_from_osrm(route["legs"][1])
        geometry = self._geometry_from_osrm(route)
        return to_pickup, to_dropoff, geometry

    def _leg_from_osrm(self, leg: dict) -> RouteLeg:
        """Convert one OSRM leg (meters / seconds) into miles / hours."""
        return RouteLeg(
            distance_miles=self._convert_distance_to_miles(leg["distance"]),
            duration_hours=self._convert_duration_to_hours(leg["duration"]),
        )

    def _geometry_from_osrm(self, route: dict) -> List[Tuple[float, float]]:
        """
        Flip OSRM GeoJSON (longitude, latitude) pairs to Leaflet's
        (latitude, longitude) order.
        """
        return [
            (latitude, longitude)
            for longitude, latitude in route["geometry"]["coordinates"]
        ]

    @staticmethod
    def _coordinates_nearly_equal(
        left: Tuple[float, float],
        right: Tuple[float, float],
    ) -> bool:
        return (
            abs(left[0] - right[0]) < _SAME_POINT_EPSILON_DEGREES
            and abs(left[1] - right[1]) < _SAME_POINT_EPSILON_DEGREES
        )

    def _find_timezone(self, coordinates: Tuple[float, float]) -> str:
        """
        Resolve the current location's coordinates to an IANA timezone.

        timezonefinder performs this lookup locally against geographic
        boundary data, so planning does not add another network dependency.
        The resulting name (for example, America/Chicago) is carried with
        RouteInfo and becomes the scheduler's clock and log-sheet timezone.
        """
        latitude, longitude = coordinates
        try:
            timezone_name = _TIMEZONE_FINDER.timezone_at(lat=latitude, lng=longitude)
        except ValueError as error:
            raise TimezoneLookupError(
                f"Could not determine a timezone for coordinates ({latitude}, {longitude})."
            ) from error

        if timezone_name is None:
            raise TimezoneLookupError(
                f"Could not determine a timezone for coordinates ({latitude}, {longitude})."
            )

        return timezone_name

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
