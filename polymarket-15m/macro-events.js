// Macro Economic Events Module for Polymarket 15M Bot
// Separate trading path — tracks independently from ARB and signal paths

const CALENDAR_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// Events that move crypto markets (USD-denominated assets react to USD events)
const CRYPTO_RELEVANT_CURRENCIES = ['USD', 'ALL'];
const CRYPTO_RELEVANT_KEYWORDS = [
  'CPI', 'PPI', 'NFP', 'Non-Farm', 'FOMC', 'Fed', 'Interest Rate',
  'GDP', 'Retail Sales', 'Unemployment', 'PCE', 'Core PCE',
  'Consumer Confidence', 'ISM', 'PMI', 'Jobless Claims',
  'Treasury', 'Inflation', 'Powell'
];

// How events typically affect crypto
const EVENT_BIAS = {
  // CPI/PPI higher than expected = hawkish = crypto bearish
  'CPI': { hotBias: 'DOWN', coldBias: 'UP', volatilityMinutes: 30 },
  'PPI': { hotBias: 'DOWN', coldBias: 'UP', volatilityMinutes: 20 },
  'PCE': { hotBias: 'DOWN', coldBias: 'UP', volatilityMinutes: 30 },
  'Core PCE': { hotBias: 'DOWN', coldBias: 'UP', volatilityMinutes: 30 },
  // Jobs stronger than expected = hawkish = crypto bearish
  'NFP': { hotBias: 'DOWN', coldBias: 'UP', volatilityMinutes: 45 },
  'Non-Farm': { hotBias: 'DOWN', coldBias: 'UP', volatilityMinutes: 45 },
  'Unemployment': { hotBias: 'UP', coldBias: 'DOWN', volatilityMinutes: 30 }, // lower unemployment = hawkish
  'Jobless Claims': { hotBias: 'UP', coldBias: 'DOWN', volatilityMinutes: 15 },
  // Fed decisions
  'FOMC': { hotBias: null, coldBias: null, volatilityMinutes: 60 }, // unpredictable direction
  'Fed': { hotBias: null, coldBias: null, volatilityMinutes: 60 },
  'Interest Rate': { hotBias: 'DOWN', coldBias: 'UP', volatilityMinutes: 45 },
  // Growth data - stronger = risk-on = crypto bullish
  'GDP': { hotBias: 'UP', coldBias: 'DOWN', volatilityMinutes: 20 },
  'Retail Sales': { hotBias: 'UP', coldBias: 'DOWN', volatilityMinutes: 15 },
  'ISM': { hotBias: 'UP', coldBias: 'DOWN', volatilityMinutes: 15 },
  'PMI': { hotBias: 'UP', coldBias: 'DOWN', volatilityMinutes: 15 },
  'Consumer Confidence': { hotBias: 'UP', coldBias: 'DOWN', volatilityMinutes: 15 },
};

async function fetchEconomicCalendar() {
  try {
    const res = await fetch(CALENDAR_URL);
    const events = await res.json();
    return events;
  } catch (e) {
    console.log('⚠️  Economic calendar fetch failed:', e.message);
    return [];
  }
}

function isCryptoRelevant(event) {
  // Must be high impact
  if (event.impact !== 'High') return false;
  
  // Must be USD or global
  if (!CRYPTO_RELEVANT_CURRENCIES.includes(event.country)) return false;
  
  // Must match a crypto-relevant keyword
  return CRYPTO_RELEVANT_KEYWORDS.some(kw => 
    event.title.toLowerCase().includes(kw.toLowerCase())
  );
}

function getEventType(title) {
  for (const [key, config] of Object.entries(EVENT_BIAS)) {
    if (title.toLowerCase().includes(key.toLowerCase())) {
      return { type: key, ...config };
    }
  }
  return null;
}

function parseNumeric(str) {
  if (!str || str === '') return null;
  // Remove %, K, M, B suffixes and parse
  const cleaned = str.replace(/[%KMB,]/g, '').trim();
  return parseFloat(cleaned) || null;
}

/**
 * Analyze macro events and return trading signals
 * 
 * Returns: {
 *   upcomingEvents: [],     // Events in next 60 minutes
 *   recentEvents: [],       // Events in last 30 minutes (may have actual data)
 *   tradingSignals: [],     // Actionable signals from released data
 *   avoidTrading: boolean,  // True if major event imminent (next 15 min)
 *   reason: string
 * }
 */
async function analyzeMacroEvents() {
  const events = await fetchEconomicCalendar();
  const now = new Date();
  const relevantEvents = events.filter(isCryptoRelevant);
  
  const result = {
    upcomingEvents: [],
    recentEvents: [],
    tradingSignals: [],
    avoidTrading: false,
    reason: ''
  };
  
  for (const event of relevantEvents) {
    const eventTime = new Date(event.date);
    const diffMinutes = (eventTime - now) / 60000;
    
    const eventType = getEventType(event.title);
    const forecast = parseNumeric(event.forecast);
    const previous = parseNumeric(event.previous);
    const actual = parseNumeric(event.actual);
    
    const eventInfo = {
      title: event.title,
      time: eventTime.toISOString(),
      minutesAway: Math.round(diffMinutes),
      forecast,
      previous,
      actual,
      eventType: eventType?.type || 'unknown',
      volatilityMinutes: eventType?.volatilityMinutes || 20
    };
    
    // Upcoming event (next 60 minutes)
    if (diffMinutes > 0 && diffMinutes <= 60) {
      result.upcomingEvents.push(eventInfo);
      
      // Avoid trading 15 minutes before high-impact events
      if (diffMinutes <= 15) {
        result.avoidTrading = true;
        result.reason = `${event.title} in ${Math.round(diffMinutes)} min — avoid trading`;
      }
    }
    
    // Recent event with actual data (released in last 30 minutes)
    if (diffMinutes <= 0 && diffMinutes >= -30 && actual !== null && eventType) {
      result.recentEvents.push(eventInfo);
      
      // Generate trading signal based on actual vs forecast
      if (forecast !== null && eventType.hotBias) {
        const surprise = actual - forecast;
        const surprisePercent = forecast !== 0 ? Math.abs(surprise / forecast) * 100 : 0;
        
        // Only signal on meaningful surprises (>5% deviation from forecast)
        if (surprisePercent > 5) {
          const isHot = surprise > 0; // higher than expected
          
          // For unemployment/jobless claims, "hot" means MORE unemployment = dovish = crypto UP
          const direction = isHot ? eventType.hotBias : eventType.coldBias;
          
          if (direction) {
            const confidence = surprisePercent > 20 ? 0.85 : 
                              surprisePercent > 10 ? 0.75 : 0.65;
            
            result.tradingSignals.push({
              type: 'MACRO',
              title: event.title,
              direction,
              confidence,
              reason: `${event.title}: actual ${event.actual} vs forecast ${event.forecast} (${isHot ? 'hotter' : 'cooler'} than expected)`,
              surprisePercent: surprisePercent.toFixed(1),
              validForMinutes: eventType.volatilityMinutes,
              assets: ['BTC', 'ETH', 'SOL'] // All crypto assets react to macro
            });
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * Get macro signal for a specific asset and direction
 * Returns { hasMacroSignal, confidence, reason } or null
 */
async function getMacroSignal(asset, direction) {
  const analysis = await analyzeMacroEvents();
  
  // If we should avoid trading, return a block signal
  if (analysis.avoidTrading) {
    return { 
      hasMacroSignal: false, 
      shouldBlock: true, 
      reason: analysis.reason 
    };
  }
  
  // Check for matching trading signals
  const matchingSignal = analysis.tradingSignals.find(s => 
    s.assets.includes(asset) && s.direction === direction
  );
  
  if (matchingSignal) {
    return {
      hasMacroSignal: true,
      shouldBlock: false,
      confidence: matchingSignal.confidence,
      reason: matchingSignal.reason,
      type: 'MACRO',
      validForMinutes: matchingSignal.validForMinutes
    };
  }
  
  // Check for opposing signals (macro says opposite direction)
  const opposingSignal = analysis.tradingSignals.find(s =>
    s.assets.includes(asset) && s.direction !== direction
  );
  
  if (opposingSignal) {
    return {
      hasMacroSignal: false,
      shouldBlock: true,
      reason: `Macro signal opposes: ${opposingSignal.reason}`
    };
  }
  
  return { hasMacroSignal: false, shouldBlock: false, reason: 'No macro events' };
}

module.exports = { analyzeMacroEvents, getMacroSignal, fetchEconomicCalendar, isCryptoRelevant };
