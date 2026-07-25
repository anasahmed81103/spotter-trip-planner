/**
 * Builds a short country label for the daily-logs header from the trip's
 * stop display names (e.g. "Dallas, Texas, USA" → "United States").
 *
 * Intermediate cities and IANA timezones are intentionally omitted; only
 * the distinct countries touched by current / pickup / dropoff are shown.
 */

const UNITED_STATES_ALIASES = new Set([
  "usa",
  "us",
  "u.s.",
  "u.s.a.",
  "united states",
  "united states of america",
]);

function countryFromLocation(location: string): string | null {
  const segments = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return null;
  }

  const raw = segments[segments.length - 1];
  if (UNITED_STATES_ALIASES.has(raw.toLowerCase())) {
    return "United States";
  }

  return raw;
}

export function formatTripCountries(locations: string[]): string {
  const seen = new Set<string>();
  const countries: string[] = [];

  for (const location of locations) {
    const country = countryFromLocation(location);
    if (!country) {
      continue;
    }
    const key = country.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    countries.push(country);
  }

  return countries.join(", ");
}
