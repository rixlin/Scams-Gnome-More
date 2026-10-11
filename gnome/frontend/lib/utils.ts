import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours === 0) return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  return `${hours}h ${remainingMins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
}

export function formatStartTime(dateInput: string | Date): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return String(dateInput);
  }
}

export function formatCallDateTime(dateInput: string | Date): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const dateStr = d.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timeStr = d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return `${dateStr} @ ${timeStr}`;
  } catch {
    return String(dateInput);
  }
}

const COUNTRY_TO_ALPHA3: Record<string, string> = {
  // United States
  "united states": "USA",
  "united states of america": "USA",
  usa: "USA",
  us: "USA",
  // Canada
  canada: "CAN",
  can: "CAN",
  ca: "CAN",
  // United Kingdom
  "united kingdom": "GBR",
  uk: "GBR",
  gbr: "GBR",
  "great britain": "GBR",
  britain: "GBR",
  england: "GBR",
  // Australia
  australia: "AUS",
  aus: "AUS",
  au: "AUS",
  // Germany
  germany: "DEU",
  deu: "DEU",
  de: "DEU",
  deutschland: "DEU",
  // France
  france: "FRA",
  fra: "FRA",
  fr: "FRA",
  // India
  india: "IND",
  ind: "IND",
  in: "IND",
  // Mexico
  mexico: "MEX",
  mex: "MEX",
  mx: "MEX",
  // Italy
  italy: "ITA",
  ita: "ITA",
  it: "ITA",
  // Spain
  spain: "ESP",
  esp: "ESP",
  es: "ESP",
  // Japan
  japan: "JPN",
  jpn: "JPN",
  jp: "JPN",
  // China
  china: "CHN",
  chn: "CHN",
  cn: "CHN",
  // Brazil
  brazil: "BRA",
  brasil: "BRA",
  bra: "BRA",
  br: "BRA",
  // Netherlands
  netherlands: "NLD",
  nld: "NLD",
  nl: "NLD",
  // Sweden
  sweden: "SWE",
  swe: "SWE",
  se: "SWE",
  // Switzerland
  switzerland: "CHE",
  che: "CHE",
  ch: "CHE",
  // New Zealand
  "new zealand": "NZL",
  nzl: "NZL",
  nz: "NZL",
  // Ireland
  ireland: "IRL",
  irl: "IRL",
  ie: "IRL",
  // South Africa
  "south africa": "ZAF",
  zaf: "ZAF",
  za: "ZAF",
  // Philippines
  philippines: "PHL",
  phl: "PHL",
  ph: "PHL",
  // Singapore
  singapore: "SGP",
  sgp: "SGP",
  sg: "SGP",
  // South Korea
  "south korea": "KOR",
  korea: "KOR",
  kor: "KOR",
  kr: "KOR",
};

export function toCountryAlpha3(countryInput?: string | null): string | undefined {
  if (!countryInput) return undefined;
  const cleaned = countryInput.trim().toLowerCase();
  if (COUNTRY_TO_ALPHA3[cleaned]) return COUNTRY_TO_ALPHA3[cleaned];
  if (/^[a-zA-Z]{3}$/.test(countryInput.trim())) {
    return countryInput.trim().toUpperCase();
  }
  return undefined;
}

export function inferCountry(scammerNumber?: string, region?: string): string {
  const reg = (region || "").trim().toLowerCase();

  for (const [name, code] of Object.entries(COUNTRY_TO_ALPHA3)) {
    const regex = new RegExp(`\\b${name}\\b`, "i");
    if (regex.test(reg)) {
      return code;
    }
  }

  const num = (scammerNumber || "").trim();
  if (num.startsWith("+1") || /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(num)) {
    return "USA";
  }
  if (num.startsWith("+44")) return "GBR";
  if (num.startsWith("+61")) return "AUS";
  if (num.startsWith("+49")) return "DEU";
  if (num.startsWith("+33")) return "FRA";
  if (num.startsWith("+91")) return "IND";
  if (num.startsWith("+52")) return "MEX";
  if (num.startsWith("+81")) return "JPN";
  if (num.startsWith("+86")) return "CHN";

  return "USA";
}

export function formatRegionWithCountry(call: {
  region?: string | null;
  country?: string | null;
  scammer_number?: string | null;
}): string {
  const rawRegion = (call.region || "").trim();
  const rawCountry = (call.country || "").trim();

  const alpha3 =
    toCountryAlpha3(rawCountry) ||
    inferCountry(call.scammer_number || "", rawRegion);

  if (!rawRegion && !alpha3) return "Unknown Region";
  if (!rawRegion) return alpha3;

  const lowerRegion = rawRegion.toLowerCase();
  const lowerAlpha3 = alpha3.toLowerCase();

  if (lowerRegion.endsWith(lowerAlpha3)) {
    return rawRegion;
  }

  for (const [name, code] of Object.entries(COUNTRY_TO_ALPHA3)) {
    if (name.length > 3 && lowerRegion.endsWith(name)) {
      const stripped = rawRegion.slice(0, -name.length).replace(/,\s*$/, "").trim();
      return stripped ? `${stripped}, ${code}` : code;
    }
  }

  return `${rawRegion}, ${alpha3}`;
}

/**
 * Obfuscates all digits in a phone number using asterisks (*),
 * except for the country code and the last 4 digits.
 * Formatting characters, symbols, and letters are preserved untouched.
 */
export function obfuscatePhoneNumber(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";

  const trimmed = raw.trim();
  const digitIndices: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (/\d/.test(raw[i])) {
      digitIndices.push(i);
    }
  }

  const totalDigits = digitIndices.length;
  if (totalDigits <= 4) {
    return raw;
  }

  // Determine country code digit count
  let countryCodeCount = 0;
  if (trimmed.startsWith("+")) {
    const delimMatch = trimmed.match(/^\+(\d{1,3})(?=[\s\-().]|\b)/);
    if (delimMatch) {
      countryCodeCount = delimMatch[1].length;
    } else {
      const rawDigits = trimmed.replace(/\D/g, "");
      if (rawDigits.startsWith("1") || rawDigits.startsWith("7")) {
        countryCodeCount = 1;
      } else {
        countryCodeCount = 2;
      }
    }
  } else {
    const noPlusMatch = trimmed.match(/^1(?=[\s\-().])/);
    if (noPlusMatch && trimmed.replace(/\D/g, "").length >= 11) {
      countryCodeCount = 1;
    }
  }

  // If there are no middle digits to obfuscate, return original
  if (totalDigits <= countryCodeCount + 4) {
    return raw;
  }

  // Digits to keep: first `countryCodeCount` digits, and last 4 digits
  // Digits to obfuscate: indices from `countryCodeCount` up to `totalDigits - 5`
  const obfuscateSet = new Set<number>();
  for (let r = countryCodeCount; r < totalDigits - 4; r++) {
    obfuscateSet.add(digitIndices[r]);
  }

  let result = "";
  for (let i = 0; i < raw.length; i++) {
    if (obfuscateSet.has(i)) {
      result += "*";
    } else {
      result += raw[i];
    }
  }

  return result;
}

export function formatNumberDisplay(
  raw?: string | null,
  hideNumbers: boolean = false
): string {
  if (!raw) return "";
  if (!hideNumbers) return raw;
  return obfuscatePhoneNumber(raw);
}

