/**
 * Formats a duration given in decimal hours into a human-readable string
 * (e.g. "6h 30m"), used on the route summary and daily log sheets.
 */
export function formatDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) {
    return "0h 0m";
  }

  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${wholeHours}h ${minutes}m`;
}
