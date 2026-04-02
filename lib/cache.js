/**
 * Simple file-based flight cache.
 * Stores results in data/cache.json keyed by "FLIGHT:DATE".
 * TTL: 6 hours — flight schedule data is stable enough.
 */

const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function load() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(cache) {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function get(flightNumber, date) {
  const cache = load();
  const key = `${flightNumber}:${date}`;
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    console.log(`[cache] expired: ${key}`);
    return null;
  }
  console.log(`[cache] hit: ${key} (age: ${Math.round((Date.now() - entry.cachedAt) / 60000)}m)`);
  return entry.data;
}

function set(flightNumber, date, data) {
  const cache = load();
  const key = `${flightNumber}:${date}`;
  cache[key] = { data, cachedAt: Date.now() };
  save(cache);
  console.log(`[cache] stored: ${key}`);
}

module.exports = { get, set };
