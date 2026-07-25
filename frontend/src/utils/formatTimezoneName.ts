/**
 * Turns an IANA timezone id (e.g. "America/Chicago") into a familiar
 * label like "Central Time" for the daily-logs header.
 */

const IANA_TO_STANDARD_NAME: Record<string, string> = {
  "America/New_York": "Eastern Time",
  "America/Detroit": "Eastern Time",
  "America/Kentucky/Louisville": "Eastern Time",
  "America/Kentucky/Monticello": "Eastern Time",
  "America/Indiana/Indianapolis": "Eastern Time",
  "America/Indiana/Vincennes": "Eastern Time",
  "America/Indiana/Winamac": "Eastern Time",
  "America/Indiana/Marengo": "Eastern Time",
  "America/Indiana/Petersburg": "Eastern Time",
  "America/Indiana/Vevay": "Eastern Time",
  "America/Chicago": "Central Time",
  "America/Indiana/Tell_City": "Central Time",
  "America/Indiana/Knox": "Central Time",
  "America/Menominee": "Central Time",
  "America/North_Dakota/Center": "Central Time",
  "America/North_Dakota/New_Salem": "Central Time",
  "America/North_Dakota/Beulah": "Central Time",
  "America/Denver": "Mountain Time",
  "America/Boise": "Mountain Time",
  "America/Phoenix": "Mountain Time",
  "America/Los_Angeles": "Pacific Time",
  "America/Anchorage": "Alaska Time",
  "America/Juneau": "Alaska Time",
  "America/Sitka": "Alaska Time",
  "America/Yakutat": "Alaska Time",
  "America/Nome": "Alaska Time",
  "America/Adak": "Hawaii-Aleutian Time",
  "Pacific/Honolulu": "Hawaii Time",
  "America/Puerto_Rico": "Atlantic Time",
};

function friendlyNameFromIntl(timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longGeneric",
    }).formatToParts(new Date());

    return parts.find((part) => part.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

export function formatTimezoneName(timeZone: string): string {
  return IANA_TO_STANDARD_NAME[timeZone] ?? friendlyNameFromIntl(timeZone) ?? timeZone;
}
