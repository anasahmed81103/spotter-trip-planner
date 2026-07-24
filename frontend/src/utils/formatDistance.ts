/**
 * Formats a distance given in miles for display (e.g. "742.3 mi"), used
 * on the route summary.
 */
export function formatDistance(miles: number): string {
  if (!Number.isFinite(miles) || miles < 0) {
    return "0 mi";
  }

  return `${miles.toFixed(1)} mi`;
}
