/**
 * Flight lookup via AviationStack API
 * https://aviationstack.com/documentation
 *
 * Falls back to demo data when no API key is configured.
 */

const API_BASE = 'http://api.aviationstack.com/v1'; // free tier is HTTP only

/**
 * Look up a flight by IATA flight number and date.
 *
 * @param {string} flightNumber - e.g. "AA100", "UA900", "BA178"
 * @param {string} date         - YYYY-MM-DD
 * @returns {Promise<object>}   normalized flight object
 */
async function lookupFlight(flightNumber, date) {
  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    return getDemoFlight(flightNumber, date);
  }

  const iata = flightNumber.replace(/\s+/g, '').toUpperCase();
  const url = `${API_BASE}/flights?access_key=${encodeURIComponent(apiKey)}&flight_iata=${encodeURIComponent(iata)}&flight_date=${encodeURIComponent(date)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`AviationStack API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`AviationStack: ${json.error.message || JSON.stringify(json.error)}`);
  }

  if (!json.data || json.data.length === 0) {
    throw new Error(`No flight found for ${iata} on ${date}`);
  }

  const f = json.data[0];

  return normalizeFlight(f, iata, date);
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
  'AA100': {
    airline: 'American Airlines',
    origin: { airport: 'John F. Kennedy Intl', iata: 'JFK', city: 'New York', timezone: 'America/New_York', offset: -5 },
    destination: { airport: 'London Heathrow', iata: 'LHR', city: 'London', timezone: 'Europe/London', offset: 0 },
    departureHour: 19, departureMin: 0,   // 7:00 PM local
    arrivalHour: 7, arrivalMin: 15,       // 7:15 AM local (next day)
    durationHours: 7.25,
  },
  'BA178': {
    airline: 'British Airways',
    origin: { airport: 'London Heathrow', iata: 'LHR', city: 'London', timezone: 'Europe/London', offset: 0 },
    destination: { airport: 'John F. Kennedy Intl', iata: 'JFK', city: 'New York', timezone: 'America/New_York', offset: -5 },
    departureHour: 8, departureMin: 30,
    arrivalHour: 11, arrivalMin: 30,
    durationHours: 8,
  },
  'UA900': {
    airline: 'United Airlines',
    origin: { airport: 'San Francisco Intl', iata: 'SFO', city: 'San Francisco', timezone: 'America/Los_Angeles', offset: -8 },
    destination: { airport: 'Narita Intl', iata: 'NRT', city: 'Tokyo', timezone: 'Asia/Tokyo', offset: 9 },
    departureHour: 11, departureMin: 30,
    arrivalHour: 15, arrivalMin: 0,
    durationHours: 11.5,
  },
  'EK215': {
    airline: 'Emirates',
    origin: { airport: 'Dubai Intl', iata: 'DXB', city: 'Dubai', timezone: 'Asia/Dubai', offset: 4 },
    destination: { airport: 'Los Angeles Intl', iata: 'LAX', city: 'Los Angeles', timezone: 'America/Los_Angeles', offset: -8 },
    departureHour: 8, departureMin: 15,
    arrivalHour: 12, arrivalMin: 30,
    durationHours: 16.25,
  },
  'SQ25': {
    airline: 'Singapore Airlines',
    origin: { airport: 'Singapore Changi', iata: 'SIN', city: 'Singapore', timezone: 'Asia/Singapore', offset: 8 },
    destination: { airport: 'Frankfurt Airport', iata: 'FRA', city: 'Frankfurt', timezone: 'Europe/Berlin', offset: 1 },
    departureHour: 23, departureMin: 35,
    arrivalHour: 6, arrivalMin: 10,
    durationHours: 13.6,
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
