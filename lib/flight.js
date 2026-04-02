/**
 * Flight lookup via AviationStack API
 * https://aviationstack.com/documentation
 *
 * Falls back to demo data when no API key is configured.
 */

const cache = require('./cache');

const API_BASE = 'http://api.aviationstack.com/v1'; // free tier is HTTP only

/**
 * Look up a flight by IATA flight number and date.
 * Checks the local cache first to avoid burning API calls.
 *
 * @param {string} flightNumber - e.g. "AA100", "UA900", "BA178"
 * @param {string} date         - YYYY-MM-DD
 * @returns {Promise<object>}   normalized flight object
 */
async function lookupFlight(flightNumber, date) {
  const apiKey = (process.env.AVIATIONSTACK_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your_key_here') {
    return getDemoFlight(flightNumber, date);
  }

  const iata = flightNumber.replace(/\s+/g, '').toUpperCase();

  // Check cache first
  const cached = cache.get(iata, date);
  if (cached) return cached;

  const url = `${API_BASE}/flights?access_key=${encodeURIComponent(apiKey)}&flight_iata=${encodeURIComponent(iata)}&flight_date=${encodeURIComponent(date)}`;

  console.log(`[api] fetching ${iata} on ${date} (key: ${apiKey.slice(0, 4)}...)`);
  const res = await fetch(url);

  // Always try to parse the body — AviationStack returns JSON even on errors
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`AviationStack API error: ${res.status} ${res.statusText}`);
  }

  if (json.error) {
    const msg = json.error.message || json.error.info || JSON.stringify(json.error);
    console.error(`[api] error: ${msg}`);
    throw new Error(`AviationStack: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`AviationStack API error: ${res.status} ${res.statusText}`);
  }

  if (!json.data || json.data.length === 0) {
    throw new Error(`No flight found for ${iata} on ${date}`);
  }

  const f = json.data[0];
  const flight = normalizeFlight(f, iata, date);

  // Store in cache
  cache.set(iata, date, flight);

  return flight;
}

/** Normalize AviationStack response to our internal format */
function normalizeFlight(f, iata, date) {
  const dep = f.departure || {};
  const arr = f.arrival || {};

  return {
    flightNumber: iata,
    date,
    airline: f.airline?.name || iata.slice(0, 2),
    status: f.flight_status || 'scheduled',
    origin: {
      airport: dep.airport || 'Unknown',
      iata: dep.iata || '',
      city: dep.timezone?.split('/')?.pop()?.replace(/_/g, ' ') || dep.iata || '',
      timezone: dep.timezone || 'UTC',
      offset: timezoneToOffset(dep.timezone),
    },
    destination: {
      airport: arr.airport || 'Unknown',
      iata: arr.iata || '',
      city: arr.timezone?.split('/')?.pop()?.replace(/_/g, ' ') || arr.iata || '',
      timezone: arr.timezone || 'UTC',
      offset: timezoneToOffset(arr.timezone),
    },
    departure: {
      scheduled: dep.scheduled || null,
      estimated: dep.estimated || null,
      actual: dep.actual || null,
      gate: dep.gate || null,
      terminal: dep.terminal || null,
    },
    arrival: {
      scheduled: arr.scheduled || null,
      estimated: arr.estimated || null,
      actual: arr.actual || null,
      gate: arr.gate || null,
      terminal: arr.terminal || null,
    },
    live: f.live || null,
  };
}

/**
 * Estimate UTC offset from IANA timezone name.
 * This is a simplified lookup — covers major zones.
 */
function timezoneToOffset(tz) {
  const offsets = {
    'America/New_York': -5, 'America/Chicago': -6, 'America/Denver': -7,
    'America/Los_Angeles': -8, 'America/Anchorage': -9, 'Pacific/Honolulu': -10,
    'America/Phoenix': -7, 'America/Toronto': -5, 'America/Vancouver': -8,
    'America/Mexico_City': -6, 'America/Bogota': -5, 'America/Lima': -5,
    'America/Sao_Paulo': -3, 'America/Buenos_Aires': -3, 'America/Santiago': -4,
    'Europe/London': 0, 'Europe/Dublin': 0, 'Europe/Lisbon': 0,
    'Europe/Paris': 1, 'Europe/Berlin': 1, 'Europe/Rome': 1,
    'Europe/Madrid': 1, 'Europe/Amsterdam': 1, 'Europe/Brussels': 1,
    'Europe/Zurich': 1, 'Europe/Vienna': 1, 'Europe/Stockholm': 1,
    'Europe/Copenhagen': 1, 'Europe/Oslo': 1, 'Europe/Warsaw': 1,
    'Europe/Prague': 1, 'Europe/Budapest': 1,
    'Europe/Athens': 2, 'Europe/Helsinki': 2, 'Europe/Bucharest': 2,
    'Europe/Istanbul': 3, 'Europe/Moscow': 3,
    'Asia/Dubai': 4, 'Asia/Karachi': 5, 'Asia/Kolkata': 5.5,
    'Asia/Colombo': 5.5, 'Asia/Dhaka': 6, 'Asia/Bangkok': 7,
    'Asia/Jakarta': 7, 'Asia/Singapore': 8, 'Asia/Hong_Kong': 8,
    'Asia/Shanghai': 8, 'Asia/Taipei': 8, 'Asia/Seoul': 9,
    'Asia/Tokyo': 9, 'Australia/Sydney': 11, 'Australia/Melbourne': 11,
    'Australia/Perth': 8, 'Australia/Brisbane': 10, 'Australia/Adelaide': 10.5,
    'Pacific/Auckland': 13, 'Pacific/Fiji': 12,
    'Africa/Cairo': 2, 'Africa/Lagos': 1, 'Africa/Johannesburg': 2,
    'Africa/Nairobi': 3, 'Africa/Casablanca': 1,
    'Asia/Riyadh': 3, 'Asia/Tehran': 3.5, 'Asia/Kabul': 4.5,
    'Asia/Kathmandu': 5.75, 'Asia/Yangon': 6.5,
    'Asia/Kuala_Lumpur': 8, 'Asia/Manila': 8,
  };

  if (!tz) return 0;
  // Try direct match
  if (offsets[tz] !== undefined) return offsets[tz];
  // Try partial match
  for (const [key, val] of Object.entries(offsets)) {
    if (tz.includes(key.split('/')[1])) return val;
  }
  return 0;
}

/** Demo flights for when no API key is configured */
const DEMO_FLIGHTS = {
  // Surfing — LA to Bali
  'GA215': {
    airline: 'Garuda Indonesia',
    origin: { airport: 'Los Angeles Intl', iata: 'LAX', city: 'Los Angeles', timezone: 'America/Los_Angeles', offset: -8 },
    destination: { airport: 'Ngurah Rai Intl', iata: 'DPS', city: 'Bali', timezone: 'Asia/Jakarta', offset: 8 },
    departureHour: 23, departureMin: 30,
    arrivalHour: 11, arrivalMin: 45,
    durationHours: 17.25,
  },
  // Skiing — NYC to Zurich (Swiss Alps)
  'LX23': {
    airline: 'Swiss',
    origin: { airport: 'John F. Kennedy Intl', iata: 'JFK', city: 'New York', timezone: 'America/New_York', offset: -5 },
    destination: { airport: 'Zurich Airport', iata: 'ZRH', city: 'Zurich', timezone: 'Europe/Zurich', offset: 1 },
    departureHour: 17, departureMin: 40,
    arrivalHour: 7, arrivalMin: 30,
    durationHours: 7.8,
  },
  // Trail running — London to Cape Town
  'BA43': {
    airline: 'British Airways',
    origin: { airport: 'London Heathrow', iata: 'LHR', city: 'London', timezone: 'Europe/London', offset: 0 },
    destination: { airport: 'Cape Town Intl', iata: 'CPT', city: 'Cape Town', timezone: 'Africa/Johannesburg', offset: 2 },
    departureHour: 19, departureMin: 10,
    arrivalHour: 7, arrivalMin: 25,
    durationHours: 11.25,
  },
  // Hiking — SF to Queenstown, New Zealand
  'NZ8': {
    airline: 'Air New Zealand',
    origin: { airport: 'San Francisco Intl', iata: 'SFO', city: 'San Francisco', timezone: 'America/Los_Angeles', offset: -8 },
    destination: { airport: 'Queenstown Airport', iata: 'ZQN', city: 'Queenstown', timezone: 'Pacific/Auckland', offset: 13 },
    departureHour: 21, departureMin: 0,
    arrivalHour: 9, arrivalMin: 30,
    durationHours: 15.5,
  },
  // Skiing — Tokyo to Denver (Colorado Rockies)
  'UA138': {
    airline: 'United Airlines',
    origin: { airport: 'Narita Intl', iata: 'NRT', city: 'Tokyo', timezone: 'Asia/Tokyo', offset: 9 },
    destination: { airport: 'Denver Intl', iata: 'DEN', city: 'Denver', timezone: 'America/Denver', offset: -7 },
    departureHour: 17, departureMin: 0,
    arrivalHour: 12, arrivalMin: 30,
    durationHours: 11.5,
  },
  // Surf/dive — London to Honolulu
  'BA27': {
    airline: 'British Airways',
    origin: { airport: 'London Heathrow', iata: 'LHR', city: 'London', timezone: 'Europe/London', offset: 0 },
    destination: { airport: 'Daniel K. Inouye Intl', iata: 'HNL', city: 'Honolulu', timezone: 'Pacific/Honolulu', offset: -10 },
    departureHour: 12, departureMin: 15,
    arrivalHour: 15, arrivalMin: 0,
    durationHours: 17.75,
  },
  // Running/trekking — NYC to Nairobi
  'KQ3': {
    airline: 'Kenya Airways',
    origin: { airport: 'John F. Kennedy Intl', iata: 'JFK', city: 'New York', timezone: 'America/New_York', offset: -5 },
    destination: { airport: 'Jomo Kenyatta Intl', iata: 'NBO', city: 'Nairobi', timezone: 'Africa/Nairobi', offset: 3 },
    departureHour: 22, departureMin: 15,
    arrivalHour: 18, arrivalMin: 0,
    durationHours: 14.75,
  },
  // Hiking — LA to Reykjavik
  'FI681': {
    airline: 'Icelandair',
    origin: { airport: 'Los Angeles Intl', iata: 'LAX', city: 'Los Angeles', timezone: 'America/Los_Angeles', offset: -8 },
    destination: { airport: 'Keflavik Intl', iata: 'KEF', city: 'Reykjavik', timezone: 'Europe/London', offset: 0 },
    departureHour: 20, departureMin: 30,
    arrivalHour: 10, arrivalMin: 45,
    durationHours: 9.25,
  },
};

function getDemoFlight(flightNumber, date) {
  const iata = flightNumber.replace(/\s+/g, '').toUpperCase();
  const demo = DEMO_FLIGHTS[iata];

  if (!demo) {
    // Generate a plausible flight from the flight number
    throw new Error(
      `No API key configured and "${iata}" is not a demo flight. ` +
      `Demo flights: ${Object.keys(DEMO_FLIGHTS).join(', ')}. ` +
      `Set AVIATIONSTACK_API_KEY in .env for real lookups.`
    );
  }

  const depDate = new Date(`${date}T${String(demo.departureHour).padStart(2, '0')}:${String(demo.departureMin).padStart(2, '0')}:00`);
  const arrDate = new Date(`${date}T${String(demo.arrivalHour).padStart(2, '0')}:${String(demo.arrivalMin).padStart(2, '0')}:00`);
  // If arrival is before departure, it's next day
  if (arrDate <= depDate) {
    arrDate.setDate(arrDate.getDate() + 1);
  }

  const scheduled_dep = depDate.toISOString().replace('Z', '');
  const scheduled_arr = arrDate.toISOString().replace('Z', '');

  return {
    flightNumber: iata,
    date,
    airline: demo.airline,
    status: 'scheduled',
    origin: { ...demo.origin },
    destination: { ...demo.destination },
    departure: { scheduled: scheduled_dep, estimated: null, actual: null, gate: null, terminal: null },
    arrival: { scheduled: scheduled_arr, estimated: null, actual: null, gate: null, terminal: null },
    live: null,
    isDemo: true,
  };
}

module.exports = { lookupFlight, DEMO_FLIGHTS };
