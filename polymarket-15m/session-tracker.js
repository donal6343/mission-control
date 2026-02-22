#!/usr/bin/env node
/**
 * Session Direction Tracker
 * Tracks EU Open (08:00-10:00 UTC) and US Open (14:30-16:30 UTC) price movements
 * for BTC, ETH, SOL, XRP. Data collection only — no trading decisions yet.
 */

const fs = require('fs');

const SESSION_DATA_FILE = __dirname + '/session-data.json';
const PRICE_HISTORY_FILE = __dirname + '/price-history.json';

const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'];

const SESSIONS = {
  eu_open:  { startH: 8,  startM: 0,  endH: 10, endM: 0  },
  us_open:  { startH: 14, startM: 30, endH: 16, endM: 30 }
};

function loadSessionData() {
  try { return JSON.parse(fs.readFileSync(SESSION_DATA_FILE, 'utf8')); }
  catch { return { sessions: [] }; }
}

function saveSessionData(data) {
  fs.writeFileSync(SESSION_DATA_FILE, JSON.stringify(data, null, 2));
}

function loadPriceHistory() {
  try { return JSON.parse(fs.readFileSync(PRICE_HISTORY_FILE, 'utf8')); }
  catch { return {}; }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function minuteOfDay(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function sessionMinuteRange(sess) {
  return {
    start: sess.startH * 60 + sess.startM,
    end: sess.endH * 60 + sess.endM
  };
}

function getCurrentSession() {
  const now = minuteOfDay(new Date());
  for (const [name, sess] of Object.entries(SESSIONS)) {
    const { start, end } = sessionMinuteRange(sess);
    if (now >= start && now < end) return name;
  }
  return null;
}

// Track session transitions for logging
let _lastSession = null;

/**
 * Called every cycle from the main loop.
 * Records price data during session windows and computes correlation after US close.
 */
function recordSessionData() {
  const now = new Date();
  const today = todayStr();
  const currentSession = getCurrentSession();
  const priceHistory = loadPriceHistory();
  const data = loadSessionData();

  // Log session transitions
  if (currentSession !== _lastSession) {
    if (currentSession === 'eu_open') console.log('🇪🇺 EU Open started (08:00-10:00 UTC)');
    else if (currentSession === 'us_open') console.log('🇺🇸 US Open started (14:30-16:30 UTC)');
    _lastSession = currentSession;
  }

  // Find or create today's entry
  let entry = data.sessions.find(s => s.date === today);
  if (!entry) {
    entry = { date: today };
    data.sessions.push(entry);
    // Keep last 30 days
    if (data.sessions.length > 30) data.sessions = data.sessions.slice(-30);
  }

  // If we're in a session window, record start/end prices
  if (currentSession) {
    const sess = SESSIONS[currentSession];
    const range = sessionMinuteRange(sess);

    if (!entry[currentSession]) entry[currentSession] = {};

    for (const asset of ASSETS) {
      const prices = priceHistory[asset] || [];
      if (prices.length === 0) continue;

      // Find earliest price in this session window today
      const sessionPrices = prices.filter(p => {
        const d = new Date(p.timestamp);
        return d.toISOString().slice(0, 10) === today &&
               minuteOfDay(d) >= range.start &&
               minuteOfDay(d) < range.end;
      });

      if (sessionPrices.length === 0) continue;

      const startPrice = sessionPrices[0].price;
      const endPrice = sessionPrices[sessionPrices.length - 1].price;
      const movePct = ((endPrice - startPrice) / startPrice) * 100;

      entry[currentSession][asset] = {
        direction: movePct >= 0 ? 'bullish' : 'bearish',
        move_pct: Math.round(movePct * 100) / 100,
        start_price: startPrice,
        end_price: endPrice
      };
    }
  }

  // After US close (16:30+), compute EU/US correlation if not already done
  const nowMin = minuteOfDay(now);
  const usEnd = sessionMinuteRange(SESSIONS.us_open).end;
  
  if (nowMin >= usEnd && entry.eu_open && entry.us_open && !entry.eu_us_correlation) {
    entry.eu_us_correlation = {};
    for (const asset of ASSETS) {
      const eu = entry.eu_open[asset];
      const us = entry.us_open[asset];
      if (eu && us) {
        entry.eu_us_correlation[asset] = (eu.direction === us.direction) ? 'followed' : 'diverged';
      }
    }
  }

  saveSessionData(data);
}

/**
 * Returns EU session bias for each asset if we're currently in the US open window.
 * Used by future trading paths.
 */
function getSessionBias() {
  const currentSession = getCurrentSession();
  if (currentSession !== 'us_open') return null;

  const data = loadSessionData();
  const today = todayStr();
  const entry = data.sessions.find(s => s.date === today);
  if (!entry || !entry.eu_open) return null;

  const bias = {};
  for (const asset of ASSETS) {
    if (entry.eu_open[asset]) {
      bias[asset] = {
        direction: entry.eu_open[asset].direction,
        move_pct: entry.eu_open[asset].move_pct
      };
    }
  }
  return bias;
}

module.exports = { recordSessionData, getSessionBias, getCurrentSession };
