# Spotter HOS Trip Planner

A full-stack trip-planning application for property-carrying commercial truck
drivers. Enter the driver's current location, pickup, dropoff, and hours already
used in the current 70-hour cycle. The application builds a road route, applies
Hours-of-Service (HOS) constraints, estimates arrival, and generates a visual
daily log for every day of the trip.

> This is a planning aid, not a certified Electronic Logging Device (ELD) or a
> substitute for carrier policy, current FMCSA guidance, or driver judgment.

## Features

### Route planning

- Plans the complete trip in order: current location → pickup → dropoff.
- Includes the deadhead drive to pickup in all HOS calculations.
- Uses OpenStreetMap Nominatim for geocoding and OSRM for road distance and
  route geometry.
- Calculates conservative truck drive time from road distance at 55 mph rather
  than using OSRM's passenger-car ETA.
- Handles a current location that is already at the pickup without creating a
  zero-length driving leg.
- Resolves the origin's IANA timezone locally and keeps the whole schedule and
  all log sheets on the origin's clock.

### HOS schedule generation

- Enforces an 11-hour daily driving limit.
- Enforces the 14-hour on-duty window.
- Adds a 30-minute break after 8 cumulative driving hours.
- Adds a 10-hour sleeper-berth reset when the daily driving or duty window is
  exhausted.
- Tracks the 70-hour / 8-day cycle and adds a 34-hour restart when required.
- Adds a 30-minute on-duty fuel stop every 1,000 driven miles.
- Adds one hour of on-duty time for pickup and one hour for dropoff.
- Keeps driving, cycle, duty-window, break, and fuel counters continuous across
  the pickup boundary.
- Splits events that cross midnight into the correct calendar-day logs.
- Handles elapsed-time arithmetic across daylight-saving changes.

### User interface

- Responsive, map-first React interface with loading and error states.
- Searchable location fields backed by a bundled US city catalog.
- Nominatim fallback for places missing from the local catalog, with request
  cancellation, deduplication, and session caching.
- Interactive dark Leaflet map with current, pickup, and dropoff markers.
- Route summary showing distance, drive time, estimated arrival, and trip days.
- FMCSA-style 24-hour duty-status charts with Off Duty, Sleeper Berth, Driving,
  and On Duty rows.
- Hoverable status-change remarks and per-day duty-status totals.
- Full-size daily-log viewer.
- Downloadable SVG file for each daily log.

### API and data model

- Stateless Django REST API.
- Validates required locations and cycle hours on both the client and server.
- Returns useful validation, unschedulable-trip, geocoding, and routing errors.
- Uses typed domain models shared conceptually between Python and TypeScript.
- Does not store trip requests or generated plans.

## Technology

- Frontend: React 19, TypeScript, Vite 8, Leaflet, React Leaflet, and plain CSS.
- Backend: Python, Django 5.2, Django REST Framework, and `requests`.
- Geographic services: OpenStreetMap Nominatim, OSRM, and `timezonefinder`.
- Map tiles: CARTO basemaps with OpenStreetMap data attribution.

## How it works

```text
Browser
  ├─ local city catalog / Nominatim autocomplete
  └─ POST /api/plan-trip
       ├─ validate request
       ├─ geocode current, pickup, and dropoff locations
       ├─ obtain OSRM road legs and route geometry
       ├─ resolve the origin timezone
       ├─ generate the legal HOS event sequence
       ├─ split events into origin-local calendar days
       └─ return route, summary, and daily logs
```

The backend is stateless. Django is configured with SQLite for its built-in
admin, authentication, and session applications, but the trip planner itself
has no application database models and does not persist any trip data. No
Redis, queue worker, file storage, user account, or authentication service is
required.

## Project structure

```text
backend/
  config/                       Django settings and root URL configuration
  scheduler/
    domain.py                   Framework-independent trip domain objects
    serializers.py              API request validation
    views.py                    POST /api/plan-trip orchestration
    services/
      constants.py              HOS and planning constants
      enums.py                  Duty-status values
      route_service.py          Nominatim, OSRM, and timezone integration
      hos_scheduler.py          HOS scheduling engine
      log_generator.py          Daily-log splitting, totals, and summary
    tests/                       Scheduler and route-service tests

frontend/
  src/
    components/                  Form, autocomplete, map, summary, log sheets
    data/usCities.ts             Bundled local city catalog
    hooks/useTripPlanner.ts      Trip-planning UI state
    pages/TripPlannerPage.tsx    Main application page
    services/                    API client, trip mapping, location search
    styles/                      Global styles and design tokens
    types/                       TypeScript application models
    utils/                       Date, duration, distance, and label formatting
```

## Local setup

### Prerequisites

- Python and `pip`
- Node.js and `npm` compatible with Vite 8
- Internet access for Nominatim, OSRM, and map tiles

### 1. Start the backend

From the repository root on Windows PowerShell:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python manage.py migrate
python manage.py runserver
```

For Command Prompt, activate with `venv\Scripts\activate`. On macOS or Linux,
activate with `source venv/bin/activate` and copy the environment file with
`cp .env.example .env`.

The API is available at `http://localhost:8000/api`.

### 2. Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Using the application

1. Enter or select the driver's current location.
2. Enter or select the pickup and dropoff locations.
3. Enter the on-duty hours already consumed in the current 70-hour / 8-day
   cycle. The value must be at least `0` and less than `70`.
4. Select **Plan trip**.
5. Review the route, distance, planned driving time, arrival, and daily HOS
   sheets.
6. Select a daily sheet to view it full size, hover its markers for event
   details, or choose **Save SVG** to download it.

The schedule starts at the current time in the current location's timezone.
There is currently no input for a future departure date or time.

## Configuration

Create local `.env` files from the supplied examples. `.env` files are ignored
by Git.

Backend (`backend/.env`):

```dotenv
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
```

Frontend (`frontend/.env`):

```dotenv
VITE_API_BASE_URL=http://localhost:8000/api
```

`VITE_API_BASE_URL` must include the `/api` prefix and must be configured before
building the frontend because Vite embeds it in the production bundle.

## REST API

### Plan a trip

```http
POST /api/plan-trip
Content-Type: application/json
```

Example request:

```json
{
  "current_location": "Dallas, TX",
  "pickup_location": "Fort Worth, TX",
  "dropoff_location": "Denver, CO",
  "current_cycle_used_hours": 12
}
```

The successful response contains:

- `route`: total distance, planned drive duration, origin timezone, waypoint
  coordinates, Leaflet-ready route geometry, and the two schedulable legs
  (`to_pickup`, `to_dropoff`).
- `summary`: total distance, drive time, number of calendar days, and estimated
  arrival.
- `daily_logs`: one entry per calendar day, including status events and totals
  for driving, on duty, off duty, and sleeper berth.

Event statuses on the wire include `driving`, `on_duty`, `break`, `fuel`,
`sleeper_berth`, and `off_duty`. Pickup and dropoff periods are recorded as
`on_duty` with remarks `"Pickup"` and `"Dropoff"`. Times are timezone-aware in
the origin location's zone (local offset), not UTC `Z`.

Estimated arrival is the end of the last driving event; the one-hour dropoff
period is deliberately excluded.

Common response statuses:

- `200`: trip plan generated.
- `400`: invalid or unschedulable input.
- `502`: an upstream geocoding or routing service failed.
- `405`: an HTTP method other than `POST` was used.

## Scheduling model and assumptions

- Property-carrying driver under the 70-hour / 8-day cycle.
- The driver begins a fresh duty day at request time; only total cycle hours
  already used are supplied.
- No adverse-driving-condition extension.
- No split-sleeper-berth provision.
- No recap of hours falling out of the rolling eight-day window; reaching 70
  hours causes a modeled 34-hour restart.
- No traffic, weather, road restriction, vehicle dimension, or hazmat model.
- OSRM provides general road routing, not truck-specific clearance routing.
- Drive time uses a fixed 55 mph planning speed.
- Pickup and dropoff each take one hour.
- Fuel stops take 30 minutes and occur every 1,000 driven miles. They are
  modeled as en-route on-duty periods, not geocoded fuel-station stops.
- All generated times use the timezone of the driver's starting location, even
  if the route crosses time zones.

## Tests and production build

Backend coverage lives in `scheduler/tests/test_hos_scheduler.py` and
`scheduler/tests/test_route_service.py`. Run them with:

```powershell
cd backend
python manage.py test
```

Check and build the frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Preview the built frontend locally with `npm run preview`.

## External-service limits

The default Nominatim and OSRM URLs are public community/demo services. They are
convenient for development and light demonstrations, but availability and rate
limits are outside this project's control. A production or higher-traffic
deployment should use policy-compliant hosted or self-managed providers by
changing the backend environment variables.

The frontend also calls public Nominatim directly when its local city catalog
has no match. Review Nominatim's usage policy before serving meaningful public
traffic.

## Deployment overview

The frontend can be deployed as a static Vite site, while the backend requires
a Python WSGI host.

A simple deployment split is:

- Frontend: Vercel, Netlify, Cloudflare Pages, or a static Render service.
- Backend: Render, Railway, Fly.io, or another Django-compatible host.

Before a public deployment, production-harden Django instead of using the
current development settings:

- load `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, and allowed CORS origins from
  environment variables;
- set `DEBUG=False`;
- use a production WSGI server such as Gunicorn rather than `runserver`;
- allow only the deployed frontend origin through CORS;
- use HTTPS and run Django's deployment checks;
- point the frontend's `VITE_API_BASE_URL` at the deployed backend `/api` URL.

No persistent database is required for trip planning. If Django admin,
authentication, or sessions are not used, their SQLite data is operationally
irrelevant to this application.
