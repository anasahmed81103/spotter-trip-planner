# HOS Trip Planner

A stateless trip-planning tool for property-carrying truck drivers. Given a
current location, pickup, dropoff, and the driver's current cycle hours
used, it returns a driving route and the FMCSA-compliant ELD daily log
sheets required to complete the trip legally.

## Features

- Generate FMCSA-compliant trip plans
- Calculate legal driving, break, and rest schedules
- Interactive route visualization
- Automatic ELD daily log sheet generation
- Multi-day trip support
- Fuel stop planning
- Stateless REST API

## Assumptions

- Property-carrying driver
- 70-hour / 8-day cycle
- No adverse driving conditions
- Fuel every 1,000 miles
- Pickup takes 1 hour
- Dropoff takes 1 hour

> **Status:** project skeleton in place; scheduling and UI logic are being
> implemented incrementally. This README is updated as each piece lands.

## Architecture

The backend is a single stateless endpoint. There is no database, no
authentication, and no persistence - a request comes in, a `TripPlan` is
computed, and it goes back out as JSON.

```
POST /api/plan-trip
   -> TripRequestSerializer   (validation only)
   -> RouteService            (OSRM + Nominatim, hidden behind build_route_info())
   -> HOSScheduler            (pure FMCSA rule engine -> ScheduleEvents)
   -> LogGenerator            (ScheduleEvents -> DailyLogs + TripSummary)
   -> TripPlan                (assembled by the view, returned as JSON)
```

`HOSScheduler` has no knowledge of Django, HTTP, or the UI - it only reasons
about driving/duty time and produces plain `ScheduleEvent` objects. This is
what keeps it independently unit-testable.

The frontend is a single page: a form on one side, and once a plan is
generated, a route map, trip summary, and one ELD log sheet per day.

## Folder structure

```
backend/
  config/                    # Django project settings, root URLconf
  scheduler/                 # the only Django app
    domain.py                # TripRequest, RouteInfo, ScheduleEvent, DailyLog, TripSummary, TripPlan
    serializers.py           # TripRequestSerializer (validation only)
    views.py                 # plan_trip() - thin, delegates to services
    urls.py
    services/
      enums.py               # DutyStatus
      constants.py           # FMCSA HOS rule constants
      route_service.py       # RouteService - OSRM + Nominatim, one public method
      hos_scheduler.py        # HOSScheduler - the scheduling engine
      log_generator.py        # LogGenerator - ScheduleEvents -> DailyLogs + TripSummary
    tests/
      test_hos_scheduler.py  # the only tests in the app

frontend/
  src/
    pages/TripPlannerPage.tsx   # the single page
    components/                 # TripForm, RouteMap, RouteSummaryCard,
                                 # DailyLogSheet, DailyLogList, Button,
                                 # LoadingSpinner, ErrorBanner
    services/                   # apiClient, tripService
    types/trip.ts                # mirrors the backend domain objects
    utils/                       # formatDuration, formatDateTime
    styles/                      # variables.css (design tokens), global.css
```

## Technology stack

- **Backend:** Django 5.2, Django REST Framework, `requests` (for OSRM/Nominatim)
- **Frontend:** React 19, TypeScript, Vite, plain CSS (no UI framework)
- **Routing/geocoding:** OSRM and Nominatim (free, OpenStreetMap-based)

## Setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env
python manage.py migrate     # only needed for Django's built-in admin/auth apps
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

## Environment variables

**backend/.env**
| Variable | Purpose |
|---|---|
| `OSRM_BASE_URL` | Base URL of the OSRM routing service |
| `NOMINATIM_BASE_URL` | Base URL of the Nominatim geocoding service |

**frontend/.env**
| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Base URL of the Django backend's API |

## API endpoint

`POST /api/plan-trip`

Request and response shapes are defined by `TripRequest` and `TripPlan` in
`backend/scheduler/domain.py` (mirrored on the frontend in
`frontend/src/types/trip.ts`). Full field-level documentation will be added
once the endpoint is implemented.

## Scheduling assumptions

To be documented alongside the `HOSScheduler` implementation (property-carrying
driver rules: 11-hour driving limit, 14-hour on-duty window, 30-minute break
after 8 hours of driving, 70-hour/8-day cycle, 10-hour off-duty reset, fuel
stop every 1,000 miles, 1 hour of on-duty time for pickup and dropoff).

## Deployment

To be documented once a deployment target is chosen.

## Future improvements

To be documented as the project evolves.
