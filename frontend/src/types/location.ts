/**
 * A geocoded place suggestion. Coordinates are retained for future
 * routing optimizations even though the plan-trip API currently only
 * accepts the display name.
 */
export interface LocationSuggestion {
  displayName: string;
  latitude: number;
  longitude: number;
}
