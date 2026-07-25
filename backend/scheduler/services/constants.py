"""
FMCSA Hours-of-Service rule constants used by HOSScheduler.

Collecting the numeric rules here means the scheduling engine reads like
the regulation it implements, and a future rule change is a one-line edit
instead of a hunt through scheduling logic.
"""

MAX_DRIVING_HOURS_PER_DAY = 11
MAX_ON_DUTY_WINDOW_HOURS = 14
REQUIRED_BREAK_AFTER_DRIVING_HOURS = 8
BREAK_DURATION_HOURS = 0.5
MIN_OFF_DUTY_RESET_HOURS = 10
MAX_CYCLE_HOURS = 70
CYCLE_WINDOW_DAYS = 8
# A driver who exhausts the 70-hour cycle cannot recover it with a normal
# 10-hour reset; only a 34-hour restart clears the cycle clock.
CYCLE_RESTART_HOURS = 34
FUEL_STOP_INTERVAL_MILES = 1000
FUEL_STOP_DURATION_HOURS = 0.5
PICKUP_DROPOFF_DURATION_HOURS = 1
# Conservative CMV planning speed used for all drive-time estimates.
# California caps most trucks at 55 mph statewide, so this figure is legal
# in every U.S. state; posted limits elsewhere may be higher, but using the
# national floor keeps schedules conservative and consistent.
TRUCK_PLANNING_SPEED_MPH = 55
