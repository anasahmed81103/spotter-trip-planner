/**
 * Renders the planned route on a map using Leaflet and OpenStreetMap
 * tiles, styled to resemble a paper atlas rather than a generic web map.
 *
 * Map rendering is not implemented yet - this placeholder just confirms
 * route data arrived, so it can be composed into the page ahead of that work.
 */

import type { RouteInfo } from "../types/trip";
import "./RouteMap.css";

interface RouteMapProps {
  route: RouteInfo;
}

export function RouteMap({ route }: RouteMapProps) {
  return (
    <div className="route-map" aria-label="Route map" data-testid="route-map-placeholder">
      <p>Map rendering coming soon.</p>
      <p>
        {route.distanceMiles.toFixed(1)} mi &middot; {route.geometry.length} route points
      </p>
    </div>
  );
}
