"""
Serializers for the scheduler app.

TripRequestSerializer only validates the incoming request body - it does
not compute anything. There is no output serializer: the response is
built directly from the TripPlan domain object by the view, since it
needs no validation on the way out.
"""

from rest_framework import serializers


class TripRequestSerializer(serializers.Serializer):
    """Validates the four fields needed to plan a trip."""

    current_location = serializers.CharField()
    pickup_location = serializers.CharField()
    dropoff_location = serializers.CharField()
    current_cycle_used_hours = serializers.FloatField(min_value=0, max_value=70)
