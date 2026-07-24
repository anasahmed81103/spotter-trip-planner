/**
 * Renders the planned route on a map using react-leaflet and OpenStreetMap
 * tiles: markers for the current location, pickup, and dropoff, and a
 * polyline tracing RouteInfo.geometry, with the viewport automatically
 * fitted to the route's bounds.
 *
 * All Leaflet-specific setup (default icon assets, bounds fitting) lives
 * inside this file so the rest of the app never needs to know react-leaflet
 * or leaflet exist.
 */

import { useEffect, useMemo } from "react";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import markerIconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import type { RouteInfo } from "../types/trip";
import "./RouteMap.css";

// Bundlers rewrite Leaflet's marker image URLs, breaking its built-in
// lookup unless the resolved asset URLs are supplied explicitly.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIconRetinaUrl,
  shadowUrl: markerShadowUrl,
});

interface RouteMapProps {
  route: RouteInfo;
}

interface FitToBoundsProps {
  bounds: LatLngBoundsExpression;
}

/** Re-fits the map's viewport whenever the route's bounds change. */
function FitToBounds({ bounds }: FitToBoundsProps) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [32, 32] });
  }, [map, bounds]);

  return null;
}

export function RouteMap({ route }: RouteMapProps) {
  const positions = route.geometry as LatLngTuple[];

  const bounds = useMemo<LatLngBoundsExpression>(() => positions, [positions]);

  if (positions.length === 0) {
    return null;
  }

  const currentPosition = positions[0];
  const dropoffPosition = positions[positions.length - 1];
  // The route's geometry is only the continuous driving polyline - it
  // doesn't record which point corresponds to the pickup waypoint. The
  // midpoint is the closest approximation available without changing
  // what RouteInfo carries.
  const pickupPosition = positions[Math.floor((positions.length - 1) / 2)];

  return (
    <div className="route-map" aria-label="Route map">
      <MapContainer bounds={bounds} className="route-map__container" scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToBounds bounds={bounds} />
        <Polyline positions={positions} />
        <Marker position={currentPosition}>
          <Popup>Current Location</Popup>
        </Marker>
        <Marker position={pickupPosition}>
          <Popup>Pickup</Popup>
        </Marker>
        <Marker position={dropoffPosition}>
          <Popup>Dropoff</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
