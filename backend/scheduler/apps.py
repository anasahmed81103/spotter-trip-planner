"""Django app configuration for the scheduler app."""

from django.apps import AppConfig


class SchedulerConfig(AppConfig):
    """Registers the scheduler app with Django. No custom startup behavior needed."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "scheduler"
