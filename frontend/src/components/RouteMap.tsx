/**
 * Renders the planned route on a dark basemap using react-leaflet.
 *
 * Always mounts a map (continental US when no route yet) so the trip planner
 * shell never shows an empty void beside the form. Dark Carto tiles, custom
 * waypoint markers, and a teal route polyline match the dispatch theme.
 */

import { useEffect, useMemo } from "react";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { RouteInfo } from "../types/trip";
import "./RouteMap.css";

interface RouteMapProps {
  route: RouteInfo | null;
  loading?: boolean;
}

interface FitToBoundsProps {
  bounds: LatLngBoundsExpression;
}

const DEFAULT_CENTER: LatLngTuple = [39.5, -98.35];
const DEFAULT_ZOOM = 5;

function createWaypointIcon(kind: "current" | "pickup" | "dropoff") {
  return L.divIcon({
    className: `route-map__marker route-map__marker--${kind}`,
    html: `<span class="route-map__marker-dot"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

const currentIcon = createWaypointIcon("current");
const pickupIcon = createWaypointIcon("pickup");
const dropoffIcon = createWaypointIcon("dropoff");

/** Re-fits the map's viewport whenever the route's bounds change. */
function FitToBounds({ bounds }: FitToBoundsProps) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12, animate: true });
  }, [map, bounds]);

  return null;
}

/** Leaflet needs an explicit resize after the stage layout changes. */
function InvalidateOnResize() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export function RouteMap({ route, loading = false }: RouteMapProps) {
  const positions = useMemo<LatLngTuple[]>(
    () => (route?.geometry ?? []) as LatLngTuple[],
    [route?.geometry],
  );
  const hasRoute = positions.length > 0;

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    if (!hasRoute) {
      return null;
    }
    return positions;
  }, [hasRoute, positions]);

  // Markers use the geocoded waypoint coordinates from the API, not the
  // route polyline. The polyline has no notion of which point is pickup,
  // so deriving pickup from its midpoint placed the marker incorrectly.
  const currentPosition = route ? (route.waypoints.current as LatLngTuple) : null;
  const pickupPosition = route ? (route.waypoints.pickup as LatLngTuple) : null;
  const dropoffPosition = route ? (route.waypoints.dropoff as LatLngTuple) : null;

  return (
    <div className={`route-map${loading ? " route-map--loading" : ""}`} aria-label="Route map">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="route-map__container"
        scrollWheelZoom
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
          maxZoom={19}
        />

        {/* Top-right keeps zoom clear of the fixed brand chip (top-left). */}
        <ZoomControl position="topright" />
        <InvalidateOnResize />
        {bounds && <FitToBounds bounds={bounds} />}

        {hasRoute && (
          <>
            <Polyline
              positions={positions}
              pathOptions={{
                color: "#2f9e8f",
                weight: 4,
                opacity: 0.92,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <Polyline
              positions={positions}
              pathOptions={{
                color: "#5fd4c4",
                weight: 1.5,
                opacity: 0.45,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {currentPosition && (
              <Marker position={currentPosition} icon={currentIcon}>
                <Popup>Current location</Popup>
              </Marker>
            )}
            {pickupPosition && (
              <Marker position={pickupPosition} icon={pickupIcon}>
                <Popup>Pickup</Popup>
              </Marker>
            )}
            {dropoffPosition && (
              <Marker position={dropoffPosition} icon={dropoffIcon}>
                <Popup>Dropoff</Popup>
              </Marker>
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
