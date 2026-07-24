"""
URL routes for the scheduler app.

A single route: POST /api/plan-trip.
"""

from django.urls import path

from scheduler.views import plan_trip

urlpatterns = [
    path("plan-trip", plan_trip, name="plan-trip"),
]
