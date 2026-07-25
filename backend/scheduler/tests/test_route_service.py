"""Tests for timezone resolution and OSRM leg parsing in RouteService."""

from unittest.mock import patch

from django.test import SimpleTestCase

from scheduler.services.route_service import RouteService, RoutingError, TimezoneLookupError

_DALLAS = (32.7767, -96.7970)
_FORT_WORTH = (32.7555, -97.3308)
_DENVER = (39.7392, -104.9903)

_METERS_PER_MILE = 1609.344


def osrm_route(leg_specs):
    """A minimal OSRM route payload with the given (meters, seconds) legs."""
    return {
        "distance": sum(meters for meters, _ in leg_specs),
        "duration": sum(seconds for _, seconds in leg_specs),
        "legs": [{"distance": meters, "duration": seconds} for meters, seconds in leg_specs],
        "geometry": {"coordinates": [[-96.7970, 32.7767], [-104.9903, 39.7392]]},
    }


class RouteServiceTimezoneTests(SimpleTestCase):
    """Timezone lookup is local, deterministic, and requires no API mock."""

    def setUp(self):
        self.service = RouteService()

    def test_dallas_coordinates_resolve_to_central_timezone(self):
        timezone_name = self.service._find_timezone(_DALLAS)

        self.assertEqual(timezone_name, "America/Chicago")

    def test_unknown_coordinates_raise_route_service_error(self):
        with self.assertRaises(TimezoneLookupError):
            self.service._find_timezone((1000, 1000))


class RouteServiceLegTests(SimpleTestCase):
    """OSRM's per-leg figures become the scheduler's two driving legs."""

    def setUp(self):
        self.service = RouteService()

    def test_three_stop_route_splits_into_deadhead_and_loaded_legs(self):
        route = osrm_route([(30 * _METERS_PER_MILE, 3600), (600 * _METERS_PER_MILE, 36000)])

        with patch.object(RouteService, "_request_route", return_value=route):
            to_pickup, to_dropoff, geometry = self.service._build_legs_and_geometry(
                _DALLAS, _FORT_WORTH, _DENVER
            )

        self.assertAlmostEqual(to_pickup.distance_miles, 30, places=4)
        self.assertAlmostEqual(to_pickup.duration_hours, 1, places=6)
        self.assertAlmostEqual(to_dropoff.distance_miles, 600, places=4)
        self.assertAlmostEqual(to_dropoff.duration_hours, 10, places=6)
        # Geometry is flipped to Leaflet's (latitude, longitude) order.
        self.assertEqual(geometry[0], (32.7767, -96.7970))

    def test_identical_current_and_pickup_produce_a_zero_deadhead_leg(self):
        route = osrm_route([(600 * _METERS_PER_MILE, 36000)])

        with patch.object(RouteService, "_request_route", return_value=route) as request_route:
            to_pickup, to_dropoff, _ = self.service._build_legs_and_geometry(
                _DALLAS, _DALLAS, _DENVER
            )

        self.assertEqual(to_pickup.distance_miles, 0.0)
        self.assertEqual(to_pickup.duration_hours, 0.0)
        self.assertAlmostEqual(to_dropoff.duration_hours, 10, places=6)
        # Only pickup -> dropoff is routed, so no wasted zero-length leg.
        self.assertEqual(request_route.call_args.args[0], [_DALLAS, _DENVER])

    def test_unexpected_leg_count_is_rejected(self):
        route = osrm_route([(600 * _METERS_PER_MILE, 36000)])

        with patch.object(RouteService, "_request_route", return_value=route):
            with self.assertRaises(RoutingError):
                self.service._build_legs_and_geometry(_DALLAS, _FORT_WORTH, _DENVER)
