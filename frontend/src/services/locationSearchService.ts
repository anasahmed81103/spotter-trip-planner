/**
 * Location search: local US city catalog first, Nominatim only when the
 * typed place is not in that catalog (or was previously learned this session).
 */

import { filterUsCities, US_CITIES } from "../data/usCities";
import type { LocationSuggestion } from "../types/location";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const RESULT_LIMIT = 5;
const MIN_REMOTE_QUERY_LENGTH = 3;

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NominatimAddress;
}

interface PendingLocationRequest {
  promise: Promise<LocationSuggestion[]>;
  controller: AbortController;
  consumers: number;
  settled: boolean;
}

/** Session-learned places (API hits) merged with the curated catalog. */
const learnedCities: LocationSuggestion[] = [];
const remoteResultCache = new Map<string, LocationSuggestion[]>();
const pendingRequests = new Map<string, PendingLocationRequest>();

export function normalizeLocationQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function compareDisplayName(a: LocationSuggestion, b: LocationSuggestion): number {
  return a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" });
}

function cityKey(city: LocationSuggestion): string {
  return `${city.displayName.toLowerCase()}|${city.latitude.toFixed(4)}|${city.longitude.toFixed(4)}`;
}

function rememberCities(cities: LocationSuggestion[]): void {
  const existing = new Set(
    [...US_CITIES, ...learnedCities].map((city) => cityKey(city)),
  );

  for (const city of cities) {
    const key = cityKey(city);
    if (existing.has(key)) {
      continue;
    }
    existing.add(key);
    learnedCities.push(city);
  }

  learnedCities.sort(compareDisplayName);
}

function filterLearnedCities(query: string): LocationSuggestion[] {
  const normalized = normalizeLocationQuery(query);
  if (!normalized) {
    return [...learnedCities];
  }

  return learnedCities.filter((city) => city.displayName.toLowerCase().includes(normalized));
}

/**
 * Instant local filter over the curated catalog (+ session-learned places).
 * Empty query returns the full alphabetical list.
 */
export function searchLocalLocations(query: string): LocationSuggestion[] {
  const curated = filterUsCities(query);
  const learned = filterLearnedCities(query);

  if (learned.length === 0) {
    return curated;
  }

  const seen = new Set(curated.map((city) => cityKey(city)));
  const merged = [...curated];
  for (const city of learned) {
    if (seen.has(cityKey(city))) {
      continue;
    }
    merged.push(city);
  }

  return merged.sort(compareDisplayName);
}

function formatDisplayName(result: NominatimSearchResult): string {
  const address = result.address;
  if (!address) {
    return result.display_name;
  }

  const locality =
    address.city ??
    address.town ??
    address.village ??
    address.hamlet ??
    address.municipality ??
    address.county ??
    result.name;

  const country = address.country === "United States" ? "USA" : address.country;
  const parts = [locality, address.state, country].filter(
    (part): part is string => Boolean(part && part.trim()),
  );

  return parts.length > 0 ? parts.join(", ") : result.display_name;
}

function toSuggestions(results: NominatimSearchResult[]): LocationSuggestion[] {
  const suggestions: LocationSuggestion[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      continue;
    }

    const displayName = formatDisplayName(result);
    const dedupeKey = `${displayName}|${latitude.toFixed(5)}|${longitude.toFixed(5)}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    suggestions.push({ displayName, latitude, longitude });
  }

  return suggestions.sort(compareDisplayName);
}

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };

    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function fetchNominatimSuggestions(
  query: string,
  signal: AbortSignal,
): Promise<LocationSuggestion[]> {
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(RESULT_LIMIT));
  // Prefer US results for this trip planner without excluding abroad entirely.
  url.searchParams.set("countrycodes", "us");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal,
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new Error("Unable to search locations. Check your connection and try again.", {
      cause: error,
    });
  }

  if (!response.ok) {
    throw new Error(`Location search failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as NominatimSearchResult[];
  return toSuggestions(payload);
}

/**
 * Remote fallback for places missing from the local catalog.
 * Cached and deduped for the session; successful hits are remembered locally.
 */
export async function searchRemoteLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const normalized = normalizeLocationQuery(query);
  if (normalized.length < MIN_REMOTE_QUERY_LENGTH) {
    return [];
  }

  const cached = remoteResultCache.get(normalized);
  if (cached) {
    rememberCities(cached);
    return cached;
  }

  let pending = pendingRequests.get(normalized);
  if (!pending) {
    const controller = new AbortController();
    const request: PendingLocationRequest = {
      promise: Promise.resolve([]),
      controller,
      consumers: 0,
      settled: false,
    };

    request.promise = fetchNominatimSuggestions(normalized, controller.signal)
      .then((suggestions) => {
        remoteResultCache.set(normalized, suggestions);
        rememberCities(suggestions);
        return suggestions;
      })
      .finally(() => {
        request.settled = true;
        if (pendingRequests.get(normalized) === request) {
          pendingRequests.delete(normalized);
        }
      });

    pending = request;
    pendingRequests.set(normalized, request);
  }

  pending.consumers += 1;

  try {
    return await raceWithAbort(pending.promise, signal);
  } finally {
    pending.consumers -= 1;
    if (pending.consumers === 0 && !pending.settled) {
      pending.controller.abort();
      if (pendingRequests.get(normalized) === pending) {
        pendingRequests.delete(normalized);
      }
    }
  }
}

/** @deprecated Prefer searchLocalLocations + searchRemoteLocations. */
export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<LocationSuggestion[]> {
  const local = searchLocalLocations(query);
  if (local.length > 0) {
    return local;
  }
  return searchRemoteLocations(query, signal);
}

export function clearLocationSearchCache(): void {
  remoteResultCache.clear();
  pendingRequests.forEach((request) => request.controller.abort());
  pendingRequests.clear();
  learnedCities.length = 0;
}
