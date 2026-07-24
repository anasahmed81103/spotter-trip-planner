"""
Enumerations shared by the domain objects and the scheduling services.

Using an enum instead of raw strings keeps HOSScheduler, LogGenerator, and
the API response all referring to the same fixed set of duty statuses
instead of scattering string literals through the codebase.
"""

from enum import Enum


class DutyStatus(str, Enum):
    """The duty-status values that can appear on a ScheduleEvent."""

    OFF_DUTY = "off_duty"
    SLEEPER_BERTH = "sleeper_berth"
    DRIVING = "driving"
    ON_DUTY = "on_duty"
    BREAK = "break"
    FUEL = "fuel"
    PICKUP = "pickup"
    DROPOFF = "dropoff"
