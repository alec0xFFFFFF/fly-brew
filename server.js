const fs = require('fs');
const path = require('path');

// Load .env for local dev (fly.io injects secrets as env vars directly)
try {
  const envPath = path.join(__dirname, '.env');
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq > 0) process.env[trimmed.slice(0, eq)] ??= trimmed.slice(eq + 1);
  });
} catch { /* no .env file — that's fine in production */ }

const express = require('express');
const { lookupFlight, DEMO_FLIGHTS } = require('./lib/flight');
const { generatePlan } = require('./lib/caffeine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ── API: Look up a flight ──
app.get('/api/flight/:number/:date', async (req, res) => {
  try {
    const flight = await lookupFlight(req.params.number, req.params.date);
    res.json({ ok: true, flight });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── API: Generate caffeine plan ──
app.get('/api/plan/:number/:date', async (req, res) => {
  try {
    const flight = await lookupFlight(req.params.number, req.params.date);

    const depTime = flight.departure.estimated || flight.departure.actual || flight.departure.scheduled;
    const arrTime = flight.arrival.estimated || flight.arrival.actual || flight.arrival.scheduled;

    if (!depTime || !arrTime) {
      throw new Error('Flight times not available yet');
    }

    const plan = generatePlan({
      departureTime: depTime,
      arrivalTime: arrTime,
      originOffset: flight.origin.offset,
      destOffset: flight.destination.offset,
      originCity: flight.origin.city,
      destCity: flight.destination.city,
    }, {
      normalWake: req.query.wake ? parseFloat(req.query.wake) : 7,
      normalSleep: req.query.sleep ? parseFloat(req.query.sleep) : 23,
    });

    res.json({ ok: true, flight, plan });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── API: List demo flights ──
app.get('/api/demos', (req, res) => {
  const demos = Object.entries(DEMO_FLIGHTS).map(([code, f]) => ({
    code,
    airline: f.airline,
    route: `${f.origin.iata} → ${f.destination.iata}`,
    cities: `${f.origin.city} → ${f.destination.city}`,
  }));
  res.json({ ok: true, demos });
});

app.listen(PORT, () => {
  console.log(`\n  ☕ Fly Brew running at http://localhost:${PORT}\n`);
  if (!process.env.AVIATIONSTACK_API_KEY || process.env.AVIATIONSTACK_API_KEY === 'your_key_here') {
    console.log('  ⚠  No API key — using demo flights only.');
    console.log('     Set AVIATIONSTACK_API_KEY in .env for real lookups.\n');
  }
});
