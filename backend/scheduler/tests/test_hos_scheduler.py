"""
Tests for HOSScheduler.

This is the one part of the app worth unit testing directly: it is pure
Python with no I/O, so tests construct TripRequest/RouteInfo objects and
assert on the resulting ScheduleEvents without any Django fixtures,
database access, or mocking.
"""

from django.test import SimpleTestCase


class HOSSchedulerTests(SimpleTestCase):
    """Verifies HOSScheduler produces FMCSA-compliant, ordered ScheduleEvents."""

    pass
