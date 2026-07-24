"""Tests for coordinate-to-timezone resolution in RouteService."""

from django.test import SimpleTestCase

from scheduler.services.route_service import RouteService, TimezoneLookupError


class RouteServiceTimezoneTests(SimpleTestCase):
    """Timezone lookup is local, deterministic, and requires no API mock."""

    def setUp(self):
        self.service = RouteService()

    def test_dallas_coordinates_resolve_to_central_timezone(self):
        timezone_name = self.service._find_timezone((32.7767, -96.7970))

        self.assertEqual(timezone_name, "America/Chicago")

    def test_unknown_coordinates_raise_route_service_error(self):
        with self.assertRaises(TimezoneLookupError):
            self.service._find_timezone((1000, 1000))
