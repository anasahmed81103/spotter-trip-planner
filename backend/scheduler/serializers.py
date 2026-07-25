"""
Serializers for the scheduler app.

TripRequestSerializer only validates the incoming request body - it does
not compute anything. There is no output serializer: the response is
built directly from the TripPlan domain object by the view, since it
needs no validation on the way out.
"""

from rest_framework import serializers

from scheduler.services.constants import MAX_CYCLE_HOURS


class TripRequestSerializer(serializers.Serializer):
    """Validates the four fields needed to plan a trip."""

    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    current_cycle_used_hours = serializers.FloatField(
        min_value=0,
        error_messages={
            "min_value": "Cycle hours used cannot be negative.",
        },
    )

    def validate_current_cycle_used_hours(self, value: float) -> float:
        """
        A driver at or beyond the 70-hour cycle limit cannot legally start
        driving, so the trip is unschedulable rather than merely long. The
        bound is exclusive to match HOSScheduler's own check.
        """
        if value >= MAX_CYCLE_HOURS:
            raise serializers.ValidationError(
                f"Cycle hours used must be less than {MAX_CYCLE_HOURS}. A driver who has already "
                f"used {MAX_CYCLE_HOURS} hours in the 8-day cycle cannot drive until a 34-hour "
                "restart is taken."
            )
        return value
