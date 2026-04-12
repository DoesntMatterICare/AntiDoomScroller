// DoomGuard Background Service Worker v2 - Enhanced Behavior Analysis Engine

// ============================================
// DOOM SITES CONFIG
// ============================================
const DEFAULT_DOOM_SITES = [
  'reddit.com', 'youtube.com', 'twitter.com', 'x.com',
  'instagram.com', 'tiktok.com', 'facebook.com',
  'linkedin.com', 'pinterest.com', 'twitch.tv',
  'snapchat.com', 'threads.net'
];

const SITE_CATEGORIES = {
  'youtube.com': 'video', 'tiktok.com': 'short-form', 'instagram.com': 'short-form',
  'snapchat.com': 'short-form', 'twitch.tv': 'streaming', 'reddit.com': 'feed',
  'twitter.com': 'feed', 'x.com': 'feed', 'threads.net': 'feed',
  'facebook.com': 'feed', 'linkedin.com': 'feed', 'pinterest.com': 'visual'
};

// ============================================
// BADGE DEFINITIONS
// ============================================
const BADGE_DEFS = [
  { id: 'first_clean',  name: 'First Step',     desc: 'First clean day under 30min',   icon: 'V'  },
  { id: 'streak_3',     name: 'Streak Starter',  desc: '3-day clean streak',            icon: '3x' },
  { id: 'streak_7',     name: 'Week Warrior',    desc: '7-day clean streak',            icon: '7x' },
  { id: 'streak_30',    name: 'Month Master',    desc: '30-day clean streak',           icon: '30' },
  { id: 'quick_check',  name: 'Quick Check',     desc: 'Session under 5 minutes',       icon: 'QC' },
  { id: 'early_bird',   name: 'Early Bird',      desc: 'No doom before 9am (5 days)',   icon: 'EB' },
  { id: 'night_free',   name: 'Night Guardian',  desc: 'No doom after 10pm (5 days)',   icon: 'NG' },
  { id: 'breath_5',     name: 'Breather',        desc: '5 breathing sessions done',     icon: 'BR' },
  { id: 'breath_25',    name: 'Breath Master',   desc: '25 breathing sessions done',    icon: 'BM' },
  { id: 'focus_5',      name: 'Focused',         desc: '5 Pomodoro sessions completed', icon: 'FO' },
  { id: 'intent_50',    name: 'Intentional',     desc: 'Intent gate used 50 times',     icon: 'IN' },
  { id: 'low_score',    name: 'Mindful',         desc: 'Doom score below 5 all day',    icon: 'MS' },
];

// ============================================
// GLOBAL PERSISTENT SESSION STATE
// ============================================
let globalDoomScore = 0;
let globalSessionData = {
  totalScrollCount: 0,
  totalClickCount: 0,
  totalTabSwitches: 0,
  totalPageLoads: 0,
  totalShortsWatched: 0,
  totalShortsMinutes: 0,
  totalReelsWatched: 0,
  totalTikToksWatched: 0,
  sitesVisited: [],
  sessionStartTime: Date.now(),
  lastActivityTime: Date.now(),
  scrollVelocityHits: 0,
  siteVisitHistory: []   // For doom loop detection
};

let tabSessions = {};
let recentSiteClosure = {};
let customDoomSites = [];
let disabledSites = [];

// Context Switching Tax — tracks rapid doom-site tab-hops within a 5-min window
let recentBlacklistedSwitches = [];   // array of {tabId, site, timestamp}
let contextSwitchTaxMultiplier = 1;   // applied in recalculateGlobalScore

// ============================================
// INITIALIZATION
// ============================================
chrome.runtime.onInstalled.addListener(async () => {
  const today = new Date().toDateString();
  const hour = new Date().getHours();
  await chrome.storage.local.set({
    settings: {
      enabled: true,
      showLossMeter: true,
      showIntentGate: true,
      showInterruptions: true,
      showBreathing: true,
      showFocusTimer: true,
      showRedirect: true,
      showNoPorn: true,
      interventionIntensity: 'medium',
      cleanDayThreshold: 30,
      customDoomSites: [],
      disabledSites: [],
      redirectAfterMinutes: 20
    },
    stats: {
      totalMinutesLost: 0,
      sessionsToday: 0,
      lastResetDate: today,
      dailyHistory: [],
      weeklyTotal: 0,
      hourlyActivity: new Array(24).fill(0),
      siteStats: {},
      streak: { current: 0, longest: 0, lastDate: null },
      badges: [],
      xp: 0,
      breathSessions: 0,
      focusSessions: 0,
      intentGateUsed: 0,
      earlyMorningCleanDays: 0,
      lateNightCleanDays: 0,
      totalScrollsAllTime: 0,
      todayScrolls: 0,
      todayShorts: 0,
      todayDoomScore: 0
    }
  });
  console.log('[DoomGuard v2] Installed');
  // Pre-warm the NSFWJS offscreen document
  setTimeout(() => ensureOffscreenDocument().catch(() => {}), 2000);
});

// Load custom doom sites and disabled sites on startup
chrome.storage.local.get(['settings'], (data) => {
  if (data.settings?.customDoomSites) {
    customDoomSites = data.settings.customDoomSites;
  }
  if (data.settings?.disabledSites) {
    disabledSites = data.settings.disabledSites;
  }
});
// ============================================
// HELPER FUNCTIONS
// ============================================
function getAllDoomSites() {
  return [...DEFAULT_DOOM_SITES, ...customDoomSites]
    .filter(site => !disabledSites.includes(site));
}

function isDoomSite(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return getAllDoomSites().some(site => hostname.includes(site));
  } catch { return false; }
}

function getSiteName(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const site of getAllDoomSites()) {
      if (hostname.includes(site)) return site;
    }
    return hostname;
  } catch { return 'unknown'; }
}

function getTimeMultiplier() {
  const hour = new Date().getHours();
  if (hour >= 0 && hour < 5) return 2.5;
  if (hour >= 23) return 2.2;
  if (hour >= 22) return 1.8;
  if (hour >= 21) return 1.4;
  if (hour >= 6 && hour < 9) return 1.2;
  return 1.0;
}

function getDurationMultiplier() {
  const minutes = (Date.now() - globalSessionData.sessionStartTime) / 60000;
  if (minutes > 60) return 2.5;
  if (minutes > 45) return 2.0;
  if (minutes > 30) return 1.7;
  if (minutes > 20) return 1.5;
  if (minutes > 10) return 1.2;
  return 1.0;
}

function getDoomLevel(score) {
  if (score < 5) return 'Clear Mind';
  if (score < 10) return 'Drifting';
  if (score < 15) return 'Sliding';
  if (score < 20) return 'Spiraling';
  if (score < 30) return 'In the Loop';
  return 'Deep Doom';
}

function calculateXPFromStats(stats) {
  let xp = 0;
  xp += stats.streak.current * 50;
  xp += stats.breathSessions * 10;
  xp += stats.focusSessions * 25;
  xp += stats.badges.length * 100;
  xp += stats.intentGateUsed * 2;
  return Math.max(0, xp);
}

function getLevel(xp) {
  const levels = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500];
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i]) return i + 1;
  }
  return 1;
}

function getLevelProgress(xp) {
  const levels = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500, 7500];
  const lvl = getLevel(xp);
  if (lvl >= levels.length) return 100;
  const current = levels[lvl - 1];
  const next = levels[lvl];
  return Math.floor(((xp - current) / (next - current)) * 100);
}

// ============================================
// DOOM SCORE CALCULATION (Enhanced)
// ============================================
function recalculateGlobalScore() {
  let score = 0;

  // Scroll signals — thresholds calibrated for DISTANCE-based counts
  // (1 count = 300px scrolled ≈ 2-3 tweets/posts).
  // Old raw-event thresholds (50/100/200) were trivially hit in seconds;
  // new thresholds represent meaningful scrolling time.
  if (globalSessionData.totalScrollCount > 80) score += 6;       // ~24,000px — heavy session
  else if (globalSessionData.totalScrollCount > 40) score += 4;  // ~12,000px — real doom scroll
  else if (globalSessionData.totalScrollCount > 15) score += 2;  // ~4,500px  — casual browsing

  // Scroll velocity (fast mindless scrolling)
  // Velocity hits are now throttled to 1/sec so these thresholds are looser
  if (globalSessionData.scrollVelocityHits > 15) score += 5;
  else if (globalSessionData.scrollVelocityHits > 8) score += 3;
  else if (globalSessionData.scrollVelocityHits > 3) score += 1;

  // Page loads
  if (globalSessionData.totalPageLoads > 20) score += 5;
  else if (globalSessionData.totalPageLoads > 15) score += 4;
  else if (globalSessionData.totalPageLoads > 8) score += 2;

  // Multi-site doom hopping
  const siteCount = globalSessionData.sitesVisited.length;
  if (siteCount >= 5) score += 12;
  else if (siteCount === 4) score += 8;
  else if (siteCount === 3) score += 6;
  else if (siteCount === 2) score += 3;

  // Doom loop detection (A→B→A→B pattern)
  const hist = globalSessionData.siteVisitHistory;
  if (hist.length >= 4 && hist[hist.length - 1] === hist[hist.length - 3] &&
      hist[hist.length - 2] === hist[hist.length - 4]) {
    score += 6;
  }

  // Short-form content (TIME based)
  const sfMinutes = globalSessionData.totalShortsMinutes;
  if (sfMinutes > 30) score += 15;
  else if (sfMinutes > 20) score += 12;
  else if (sfMinutes > 10) score += 8;
  else if (sfMinutes > 5) score += 5;
  else if (sfMinutes > 2) score += 3;

  // Short-form video count
  const sfVideos = globalSessionData.totalShortsWatched +
                   globalSessionData.totalReelsWatched +
                   globalSessionData.totalTikToksWatched;
  if (sfVideos > 50) score += 10;
  else if (sfVideos > 30) score += 8;
  else if (sfVideos > 20) score += 6;
  else if (sfVideos > 10) score += 4;
  else if (sfVideos > 5) score += 2;

  // Passive consumption: scrolled far but clicked almost nothing
  // 30 distance-counts (9,000px) + no clicks = mindless feed absorption
  if (globalSessionData.totalScrollCount > 30 && globalSessionData.totalClickCount < 5) {
    score += 4;
  }

  // Apply multipliers
  score = score * getTimeMultiplier() * getDurationMultiplier() * contextSwitchTaxMultiplier;
  globalDoomScore = Math.round(Math.max(0, score));
  globalSessionData.lastActivityTime = Date.now();
  return globalDoomScore;
}

// ============================================
// BROADCAST TO ALL TABS
// ============================================
function broadcastScoreUpdate() {
  const sessionMinutes = Math.floor((Date.now() - globalSessionData.sessionStartTime) / 60000);
  const attentionCapacity = Math.max(0, 100 - Math.floor(sessionMinutes * 2.5 * (1 + globalDoomScore * 0.03)));
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'GLOBAL_SCORE_UPDATE',
        score: globalDoomScore,
        level: getDoomLevel(globalDoomScore),
        sessionData: {
          ...globalSessionData,
          sessionMinutes,
          attentionCapacity,
          totalShortFormVideos: globalSessionData.totalShortsWatched +
                                globalSessionData.totalReelsWatched +
                                globalSessionData.totalTikToksWatched,
          contextSwitchCount: recentBlacklistedSwitches.length,
          contextSwitchTaxActive: contextSwitchTaxMultiplier > 1
        }
      }).catch(() => {});
    });
  });
}

// Broadcast at 5s — HUD doesn't need sub-5s precision, and this fires to ALL open doom tabs
setInterval(broadcastScoreUpdate, 5000);

// ============================================
// STREAK & BADGE SYSTEM
// ============================================
async function updateStreak(stats, minutesLost) {
  const today = new Date().toDateString();
  const threshold = stats.settings?.cleanDayThreshold || 30;
  const isClean = minutesLost < threshold;

  if (!stats.streak) {
    stats.streak = { current: 0, longest: 0, lastDate: null };
  }

  const lastDate = stats.streak.lastDate;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  if (lastDate === yesterdayStr && isClean) {
    stats.streak.current++;
  } else if (lastDate !== today && isClean) {
    stats.streak.current = 1;
  } else if (!isClean) {
    stats.streak.current = 0;
  }

  if (stats.streak.current > stats.streak.longest) {
    stats.streak.longest = stats.streak.current;
  }
  if (isClean) stats.streak.lastDate = today;
  return stats;
}

async function checkAndAwardBadges(stats) {
  if (!stats.badges) stats.badges = [];
  const earned = stats.badges;

  const awardIfNew = (id) => {
    if (!earned.includes(id)) { earned.push(id); return true; }
    return false;
  };

  const minutesLost = stats.totalMinutesLost;
  const streak = stats.streak?.current || 0;

  if (minutesLost < 30 && stats.sessionsToday >= 1) awardIfNew('first_clean');
  if (streak >= 3) awardIfNew('streak_3');
  if (streak >= 7) awardIfNew('streak_7');
  if (streak >= 30) awardIfNew('streak_30');
  if (minutesLost < 5 && stats.sessionsToday >= 1) awardIfNew('quick_check');
  if ((stats.breathSessions || 0) >= 5) awardIfNew('breath_5');
  if ((stats.breathSessions || 0) >= 25) awardIfNew('breath_25');
  if ((stats.focusSessions || 0) >= 5) awardIfNew('focus_5');
  if ((stats.intentGateUsed || 0) >= 50) awardIfNew('intent_50');
  if ((stats.todayDoomScore || 0) < 5 && stats.sessionsToday >= 1) awardIfNew('low_score');
  if ((stats.earlyMorningCleanDays || 0) >= 5) awardIfNew('early_bird');
  if ((stats.lateNightCleanDays || 0) >= 5) awardIfNew('night_free');

  stats.badges = earned;
  return stats;
}

// ============================================
// HOURLY ACTIVITY TRACKING
// ============================================
async function updateHourlyActivity(minutesDelta) {
  const { stats } = await chrome.storage.local.get(['stats']);
  if (!stats) return;
  if (!stats.hourlyActivity) stats.hourlyActivity = new Array(24).fill(0);
  const hour = new Date().getHours();
  stats.hourlyActivity[hour] = (stats.hourlyActivity[hour] || 0) + minutesDelta;
  await chrome.storage.local.set({ stats });
}

// ============================================
// NSFWJS OFFSCREEN DOCUMENT MANAGEMENT
// ============================================
let offscreenPort = null;
let offscreenReady = false;
let offscreenCreating = false;
const nsfwPendingRequests = new Map();
let nsfwRequestCounter = 0;

async function ensureOffscreenDocument() {
  // Check if already exists
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  }).catch(() => []);

  if (contexts.length > 0 && offscreenPort) return;

  if (offscreenCreating) {
    // Wait for creation to finish
    await new Promise(resolve => setTimeout(resolve, 800));
    return;
  }

  offscreenCreating = true;
  try {
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['DOM_SCRAPING'],
        justification: 'NSFWJS image classification for DoomGuard'
      });
    }
    // Wait for the offscreen doc to connect via port
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    console.warn('[DoomGuard] Offscreen create error:', err.message);
  } finally {
    offscreenCreating = false;
  }
}

// Handle port connection from offscreen.js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'dg-nsfwjs-port') {
    offscreenPort = port;
    offscreenReady = true;
    console.log('[DoomGuard] NSFWJS offscreen port connected');

    port.onMessage.addListener(({ requestId, predictions }) => {
      const resolve = nsfwPendingRequests.get(requestId);
      if (resolve) {
        resolve(predictions);
        nsfwPendingRequests.delete(requestId);
      }
    });

    port.onDisconnect.addListener(() => {
      offscreenPort = null;
      offscreenReady = false;
      console.log('[DoomGuard] NSFWJS offscreen port disconnected');
    });
  }
});

/**
 * Fast skin-tone pixel check using canvas — used as fallback when
 * the NSFWJS model is still loading. Returns skin ratio 0-1 or 0 on error.
 * Works only for same-origin or pre-fetched dataURLs.
 */
function quickSkinCheck(dataUrl) {
  try {
    const { createCanvas, Image } = globalThis;
    // Only works in offscreen/service worker with canvas access — use fallback
    // Actually in service worker context we don't have Canvas API, so return 0
    return 0;
  } catch (_) { return 0; }
}

/**
 * Fetch any image URL from the background (no CORS restrictions here).
 * Converts to base64 dataURL for NSFWJS consumption.
 */
async function fetchImageAsDataUrl(imageUrl) {
  try {
    if (!imageUrl || imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
      return imageUrl || null;
    }
    const response = await fetch(imageUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Accept': 'image/*' }
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    // Try no-cors fallback for restrictive servers
    try {
      const response = await fetch(imageUrl, { mode: 'no-cors' });
      // no-cors gives opaque response — can't read body, skip
    } catch (_) {}
    return null;
  }
}

/**
 * Classify an image via the offscreen NSFWJS worker.
 * Accepts a dataURL directly OR fetches the image from a URL (CORS bypass).
 */
async function classifyImageNSFW(dataUrl) {
  await ensureOffscreenDocument();
  if (!offscreenPort) {
    console.warn('[DoomGuard] No offscreen port available');
    return null;
  }

  const requestId = `nsfw-${++nsfwRequestCounter}`;
  return new Promise((resolve) => {
    nsfwPendingRequests.set(requestId, resolve);
    offscreenPort.postMessage({ requestId, dataUrl });
    // Timeout after 8 seconds
    setTimeout(() => {
      if (nsfwPendingRequests.has(requestId)) {
        nsfwPendingRequests.delete(requestId);
        resolve(null);
      }
    }, 8000);
  });
}

// ============================================
// MESSAGE HANDLERS
// ============================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {

    case 'NSFWJS_CLASSIFY': {
      // Step 1: use canvas dataUrl if provided (same-origin images)
      // Step 2: if null (CORS-blocked), fetch the image URL from background (no CORS limit)
      const classify = async () => {
        let dataUrl = message.dataUrl;

        if (!dataUrl && message.imageUrl) {
          dataUrl = await fetchImageAsDataUrl(message.imageUrl);
        }

        if (!dataUrl) {
          sendResponse({ success: false, predictions: null });
          return;
        }

        // If offscreen/NSFWJS model is still loading, use fast skin-pixel fallback
        if (!offscreenReady || !offscreenPort) {
          const skinRatio = quickSkinCheck(dataUrl);
          if (skinRatio >= 0.18) {
            sendResponse({ success: true, predictions: [
              { className: 'Sexy', probability: 0.6 + (skinRatio * 0.3) },
              { className: 'Neutral', probability: 0.1 }
            ]});
          } else {
            sendResponse({ success: false, predictions: null });
          }
          return;
        }

        const predictions = await classifyImageNSFW(dataUrl);
        sendResponse({ success: true, predictions });
      };
      classify();
      return true; // keep channel open for async response
    }

    case 'DOOM_ACTIVITY': {
      globalSessionData.totalScrollCount += message.scrollCount || 0;
      globalSessionData.totalClickCount += message.clickCount || 0;
      globalSessionData.totalPageLoads += message.pageLoads || 0;
      globalSessionData.scrollVelocityHits += message.velocityHits || 0;

      const site = message.site;
      if (site && !globalSessionData.sitesVisited.includes(site)) {
        globalSessionData.sitesVisited.push(site);
      }
      if (site) {
        const hist = globalSessionData.siteVisitHistory;
        if (hist[hist.length - 1] !== site) hist.push(site);
        if (hist.length > 20) hist.shift();
      }

      recalculateGlobalScore();
      // Don't broadcastScoreUpdate here — the 5s interval handles it,
      // avoiding a double-broadcast storm when multiple tabs are active.
      sendResponse({ success: true, globalScore: globalDoomScore });
      break;
    }

    case 'SHORTS_ACTIVITY': {
      globalSessionData.totalShortsMinutes = Math.max(globalSessionData.totalShortsMinutes, message.minutesInShorts || 0);
      globalSessionData.totalShortsWatched = Math.max(globalSessionData.totalShortsWatched, message.shortsWatched || 0);
      recalculateGlobalScore();
      sendResponse({ success: true, globalScore: globalDoomScore });
      break;
    }

    case 'REELS_ACTIVITY': {
      globalSessionData.totalShortsMinutes = Math.max(globalSessionData.totalShortsMinutes, message.minutesInReels || 0);
      globalSessionData.totalReelsWatched = Math.max(globalSessionData.totalReelsWatched, message.reelsWatched || 0);
      recalculateGlobalScore();
      sendResponse({ success: true, globalScore: globalDoomScore });
      break;
    }

    case 'TIKTOK_ACTIVITY': {
      globalSessionData.totalShortsMinutes = Math.max(globalSessionData.totalShortsMinutes, message.minutesOnTikTok || 0);
      globalSessionData.totalTikToksWatched = Math.max(globalSessionData.totalTikToksWatched, message.tiktoksWatched || 0);
      recalculateGlobalScore();
      sendResponse({ success: true, globalScore: globalDoomScore });
      break;
    }

    case 'BREATHING_DONE': {
      chrome.storage.local.get(['stats'], (data) => {
        const stats = data.stats || {};
        stats.breathSessions = (stats.breathSessions || 0) + 1;
        stats.xp = calculateXPFromStats(stats);
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      break;
    }

    case 'FOCUS_STARTED': {
      chrome.storage.local.get(['stats'], (data) => {
        const stats = data.stats || {};
        stats.focusSessions = (stats.focusSessions || 0) + 1;
        stats.xp = calculateXPFromStats(stats);
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      break;
    }

    case 'INTENT_GATE_USED': {
      chrome.storage.local.get(['stats'], (data) => {
        const stats = data.stats || {};
        stats.intentGateUsed = (stats.intentGateUsed || 0) + 1;
        chrome.storage.local.set({ stats });
      });
      sendResponse({ success: true });
      break;
    }

    case 'GET_GLOBAL_STATE': {
      const sessionMinutes = Math.floor((Date.now() - globalSessionData.sessionStartTime) / 60000);
      const attentionCapacity = Math.max(0, 100 - Math.floor(sessionMinutes * 2.5 * (1 + globalDoomScore * 0.03)));
      sendResponse({
        success: true,
        globalScore: globalDoomScore,
        level: getDoomLevel(globalDoomScore),
        sessionData: {
          ...globalSessionData,
          sessionMinutes,
          attentionCapacity,
          totalShortFormVideos: globalSessionData.totalShortsWatched +
                                globalSessionData.totalReelsWatched +
                                globalSessionData.totalTikToksWatched,
          contextSwitchCount: recentBlacklistedSwitches.length,
          contextSwitchTaxActive: contextSwitchTaxMultiplier > 1
        }
      });
      break;
    }

    case 'TAB_SESSION_START': {
      const site = getSiteName(message.url);
      const lastClosed = recentSiteClosure[site];
      const isRapidReturn = lastClosed && (Date.now() - lastClosed) < 120000;
      if (isRapidReturn) globalDoomScore += 4;
      if (!globalSessionData.sitesVisited.includes(site)) globalSessionData.sitesVisited.push(site);
      tabSessions[tabId] = { startTime: Date.now(), site, intent: message.intent || 'skipped' };
      recalculateGlobalScore();
      // Skip broadcastScoreUpdate — interval will pick it up shortly
      sendResponse({ success: true, globalScore: globalDoomScore, isRapidReturn, sitesVisited: globalSessionData.sitesVisited });
      break;
    }
    
    case 'TAB_CLOSING': {
      const site = getSiteName(message.url);
      recentSiteClosure[site] = Date.now();
      const fiveMinAgo = Date.now() - 300000;
      Object.keys(recentSiteClosure).forEach(s => {
        if (recentSiteClosure[s] < fiveMinAgo) delete recentSiteClosure[s];
      });
      sendResponse({ success: true });
      break;
    }

    case 'GET_SESSION_SUMMARY': {
      const sessionMinutes = Math.floor((Date.now() - globalSessionData.sessionStartTime) / 60000);
      const attentionCapacity = Math.max(0, 100 - Math.floor(sessionMinutes * 2.5 * (1 + globalDoomScore * 0.03)));
      const recoveryTime = Math.floor(sessionMinutes * 0.44 * getTimeMultiplier());
      const memoryRetention = Math.max(0, 100 - globalDoomScore * 3 - sessionMinutes * 1.5);
      sendResponse({
        success: true,
        summary: {
          minutesLost: sessionMinutes,
          doomScore: globalDoomScore,
          level: getDoomLevel(globalDoomScore),
          attentionCapacity,
          recoveryTime,
          memoryRetention: Math.round(memoryRetention),
          sitesVisited: globalSessionData.sitesVisited,
          totalShortFormVideos: globalSessionData.totalShortsWatched + globalSessionData.totalReelsWatched + globalSessionData.totalTikToksWatched,
          totalShortsMinutes: Math.round(globalSessionData.totalShortsMinutes),
          scrollCount: globalSessionData.totalScrollCount,
          clickCount: globalSessionData.totalClickCount,
          velocityHits: globalSessionData.scrollVelocityHits
        }
      });
      break;
    }

    case 'CHECK_DOOM_SITE': {
      sendResponse({ isDoomSite: isDoomSite(message.url) });
      break;
    }

    case 'GET_STATS': {
      chrome.storage.local.get(['stats', 'settings'], (data) => {
        if (data.stats) {
          data.stats.xp = calculateXPFromStats(data.stats);
          data.stats.level = getLevel(data.stats.xp);
          data.stats.levelProgress = getLevelProgress(data.stats.xp);
          data.stats.todayScrolls = globalSessionData.totalScrollCount;
          data.stats.todayShorts = globalSessionData.totalShortsWatched + globalSessionData.totalReelsWatched + globalSessionData.totalTikToksWatched;
          data.stats.todayDoomScore = globalDoomScore;
          data.stats.doomLevel = getDoomLevel(globalDoomScore);
          data.stats.badgeDefs = BADGE_DEFS;
        }
        sendResponse({ success: true, ...data });
      });
      return true;
    }

    case 'UPDATE_SETTINGS': {
      chrome.storage.local.get(['settings'], (data) => {
        const newSettings = { ...data.settings, ...message.settings };
        chrome.storage.local.set({ settings: newSettings }, () => {
          if (message.settings.customDoomSites !== undefined) {
            customDoomSites = message.settings.customDoomSites;
          }
          if (message.settings.disabledSites !== undefined) {
            disabledSites = message.settings.disabledSites;
          }
          sendResponse({ success: true });
        });
      });
      return true;
    }

    case 'RESET_SESSION': {
      globalDoomScore = 0;
      globalSessionData = {
        totalScrollCount: 0, totalClickCount: 0, totalTabSwitches: 0,
        totalPageLoads: 0, totalShortsWatched: 0, totalShortsMinutes: 0,
        totalReelsWatched: 0, totalTikToksWatched: 0,
        sitesVisited: [], sessionStartTime: Date.now(), lastActivityTime: Date.now(),
        scrollVelocityHits: 0, siteVisitHistory: []
      };
      broadcastScoreUpdate();
      sendResponse({ success: true });
      break;
    }

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return false;
});

// ============================================
// TAB EVENTS
// ============================================
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  globalSessionData.totalTabSwitches++;

  // Context Switching Tax — track rapid doom-site hops
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab?.url && isDoomSite(tab.url)) {
      const now = Date.now();
      const WINDOW = 5 * 60 * 1000; // 5-minute window

      // Record this switch
      recentBlacklistedSwitches.push({ tabId: activeInfo.tabId, site: getSiteName(tab.url), timestamp: now });

      // Purge switches older than 5 min
      recentBlacklistedSwitches = recentBlacklistedSwitches.filter(s => now - s.timestamp < WINDOW);

      // Apply multiplier: > 3 hops → multiply score penalty
      const hopCount = recentBlacklistedSwitches.length;
      if (hopCount > 3) {
        // Each additional hop beyond 3 adds 0.5x — e.g. 4 hops = 1.5x, 5 hops = 2x, 6 hops = 2.5x
        contextSwitchTaxMultiplier = 1 + (hopCount - 3) * 0.5;
      } else {
        contextSwitchTaxMultiplier = 1;
      }
    }
  } catch (_) {}

  recalculateGlobalScore();
  // Don't broadcastScoreUpdate here — the 5s interval handles all tabs
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabSessions[tabId]) delete tabSessions[tabId];
});

// ============================================
// CUSTOM SITE INJECTION
// ============================================
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading' || !tab.url) return;
  if (customDoomSites.length === 0) return;

  try {
    const hostname = new URL(tab.url).hostname.replace('www.', '');
    const isCustomDoom = customDoomSites.some(site => hostname.includes(site));
    const isDefaultDoom = DEFAULT_DOOM_SITES.some(site => hostname.includes(site));
    if (isCustomDoom && !isDefaultDoom) {
      chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
      chrome.scripting.insertCSS({ target: { tabId }, files: ['css/content.css'] }).catch(() => {});
    }
  } catch {}
});

// ============================================
// STORAGE PERSISTENCE
// ============================================
setInterval(async () => {
  const { stats } = await chrome.storage.local.get(['stats']);
  if (!stats) return;

  const today = new Date().toDateString();
  const sessionMinutes = Math.floor((Date.now() - globalSessionData.sessionStartTime) / 60000);
  const hour = new Date().getHours();

  if (stats.lastResetDate !== today) {
    // Day rolled over - update streak before resetting
    const threshold = 30;
    const wasClean = stats.totalMinutesLost < threshold;

    // Check early/late night behavior
    const noLateNight = (stats.hourlyActivity?.[22] || 0) + (stats.hourlyActivity?.[23] || 0) < 1;
    const noEarlyMorning = (stats.hourlyActivity?.[6] || 0) + (stats.hourlyActivity?.[7] || 0) + (stats.hourlyActivity?.[8] || 0) < 1;
    if (noLateNight) stats.lateNightCleanDays = (stats.lateNightCleanDays || 0) + 1;
    if (noEarlyMorning) stats.earlyMorningCleanDays = (stats.earlyMorningCleanDays || 0) + 1;

    stats.dailyHistory.push({
      date: stats.lastResetDate,
      minutesLost: stats.totalMinutesLost,
      sessions: stats.sessionsToday,
      doomScore: stats.todayDoomScore || 0
    });
    if (stats.dailyHistory.length > 30) stats.dailyHistory.shift();

    // Update streak
    await updateStreak(stats, stats.totalMinutesLost);
    await checkAndAwardBadges(stats);

    stats.totalMinutesLost = 0;
    stats.sessionsToday = 0;
    stats.lastResetDate = today;
    stats.hourlyActivity = new Array(24).fill(0);
    stats.siteStats = {};
  }

  // Update current stats
  stats.totalMinutesLost = sessionMinutes;
  stats.todayScrolls = globalSessionData.totalScrollCount;
  stats.todayShorts = globalSessionData.totalShortsWatched + globalSessionData.totalReelsWatched + globalSessionData.totalTikToksWatched;
  stats.todayDoomScore = globalDoomScore;
  stats.weeklyTotal = stats.dailyHistory.slice(-6).reduce((sum, d) => sum + d.minutesLost, 0) + sessionMinutes;

  // Update hourly activity
  if (!stats.hourlyActivity) stats.hourlyActivity = new Array(24).fill(0);
  stats.hourlyActivity[hour] = Math.max(stats.hourlyActivity[hour] || 0, Math.floor(sessionMinutes / 24));

  // Update per-site stats
  if (!stats.siteStats) stats.siteStats = {};
  const now = Date.now();

  // Build per-site minutes from active tabSessions
  const siteMinutesMap = {};
  Object.values(tabSessions).forEach(session => {
    if (!session?.site || !session?.startTime) return;
    const site = session.site;
    const mins = Math.floor((now - session.startTime) / 60000);
    if (!siteMinutesMap[site] || mins > siteMinutesMap[site]) siteMinutesMap[site] = mins;
  });

  // Apply to siteStats for all visited sites
  const siteCount = Math.max(globalSessionData.sitesVisited.length, 1);
  globalSessionData.sitesVisited.forEach(site => {
    if (!stats.siteStats[site]) stats.siteStats[site] = { minutes: 0, sessions: 0 };
    stats.siteStats[site].sessions = Math.max(stats.siteStats[site].sessions, 1);
    if (siteMinutesMap[site] !== undefined && siteMinutesMap[site] > 0) {
      stats.siteStats[site].minutes = siteMinutesMap[site];
    } else if (stats.siteStats[site].minutes === 0 && sessionMinutes > 0) {
      // fallback: distribute evenly if tabSessions lost data (e.g. SW restart)
      stats.siteStats[site].minutes = Math.max(1, Math.floor(sessionMinutes / siteCount));
    }
  });


  stats.xp = calculateXPFromStats(stats);
  stats.level = getLevel(stats.xp);
  stats.levelProgress = getLevelProgress(stats.xp);

  await chrome.storage.local.set({ stats });
}, 30000);

console.log('[DoomGuard v2] Background service worker started');