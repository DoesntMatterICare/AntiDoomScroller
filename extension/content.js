// DoomGuard Content Script v2 - Behavioral Tracking, UI Injection & Smart Interventions

(function () {
  'use strict';

  // ============================================
  // STATE
  // ============================================
  let sessionActive = false;
  let intentRecorded = false;
  let sessionIntent = null;
  let hudElement = null;
  let hudMinimized = false;

  let localScrollCount = 0;
  let localClickCount = 0;
  let localPageLoads = 0;
  let localVelocityHits = 0;

  let globalScore = 0;
  let globalLevel = 'Clear Mind';
  let globalSessionData = null;

  // Scroll velocity tracking
  let scrollTimes = [];

  // Short-form video tracking
  let shortsSessionData = { startTime: null, uniqueVideos: [], isActive: false, platform: null };

  let lastUrl = location.href;
  let feedObserver = null;
  let injectionCount = 0;
  let lastComparisonUpdate = 0;
  let currentComparison = '';

  // Intervention state
  let breathOverlayActive = false;
  let focusTimerActive = false;
  let focusInterval = null;
  let focusTimeLeft = 25 * 60;
  let redirectShown = false;
  let focusOfferShown = false;

  let settings = null;

  // ============================================
  // PLATFORM SELECTORS
  // ============================================
  const FEED_SELECTORS = {
    'reddit.com': {
      post: '[data-testid="post-container"], .Post, [data-click-id="body"], shreddit-post',
      feed: '[data-testid="posts-list"], .ListingLayout-outerContainer, main'
    },
    'youtube.com': {
      post: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer',
      feed: '#contents, ytd-rich-grid-renderer'
    },
    'twitter.com': {
      post: '[data-testid="tweet"], article[data-testid="tweet"]',
      feed: '[data-testid="primaryColumn"] section, main section'
    },
    'x.com': {
      post: '[data-testid="tweet"], article[data-testid="tweet"]',
      feed: '[data-testid="primaryColumn"] section, main section'
    },
    'instagram.com': {
      post: 'article._aatb, article[role="presentation"], ._aabd, div[role="presentation"]',
      feed: 'main, section'
    },
    'tiktok.com': {
      post: '[data-e2e="recommend-list-item-container"], .video-feed-item',
      feed: '[data-e2e="recommend-list-container"], .video-feed-container'
    },
    'facebook.com': {
      post: '[data-pagelet^="FeedUnit"], [role="article"]',
      feed: '[role="feed"], [data-pagelet="Feed"]'
    },
    'linkedin.com': {
      post: '.feed-shared-update-v2, [data-urn], .occludable-update',
      feed: '.scaffold-finite-scroll__content, .feed-following-feed'
    },
    'pinterest.com': {
      post: '[data-test-id="pin-closeup-link"], [data-grid-item], .GrowthUnauthPinImage',
      feed: '[data-test-id="homefeed-feed"], .Grid'
    },
    'twitch.tv': {
      post: '[data-a-target="card-0"], .Layout-sc-1xcs6mc-0',
      feed: '.front-page-carousel, .side-nav-section'
    },
    'snapchat.com': {
      post: '.story-card, [data-testid="story-item"]',
      feed: '.stories-feed'
    },
    'threads.net': {
      post: 'div[data-pressable-container], article',
      feed: 'main'
    }
  };

  // ============================================
  // INTERRUPTION MESSAGES
  // ============================================
  const INTERRUPTION_MESSAGES = [
    () => `This post cost you 30 seconds`,
    () => `You won't remember this tomorrow`,
    () => `Scroll count: ${globalSessionData?.totalScrollCount || 0} and climbing`,
    () => `Your attention just dropped 1%`,
    () => `The algorithm just won again`,
    () => `${globalSessionData?.sessionMinutes || 0} min gone. Still here?`,
    () => `Doom Score: ${globalScore}. Still scrolling.`,
    () => `Every scroll trains your brain for less`,
    () => `Nothing in the last 5 min mattered`,
    () => `${globalSessionData?.totalShortFormVideos || 0} shorts. Remember any?`,
    () => `Open tabs: ${globalSessionData?.sitesVisited?.length || 1} doom sites`,
    () => `Fast scrolling detected — ${globalSessionData?.scrollVelocityHits || 0} velocity bursts`,
  ];

  function getRandomInterruption() {
    const msg = INTERRUPTION_MESSAGES[Math.floor(Math.random() * INTERRUPTION_MESSAGES.length)];
    return msg();
  }

  // ============================================
  // SHORT-FORM VIDEO DETECTION
  // ============================================
  const isYouTubeShorts = (url) => url.includes('youtube.com/shorts/');
  const isInstagramReels = (url) => url.includes('instagram.com/reels/') || url.includes('instagram.com/reel/');
  const isTikTok = (url) => url.includes('tiktok.com') && (url.includes('/video/') || url.includes('/@'));

  function getShortFormPlatform(url) {
    if (isYouTubeShorts(url)) return 'youtube';
    if (isInstagramReels(url)) return 'instagram';
    if (isTikTok(url)) return 'tiktok';
    return null;
  }

  function extractVideoId(url) {
    if (isYouTubeShorts(url)) { const m = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }
    if (isInstagramReels(url)) { const m = url.match(/\/reels?\/([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }
    if (isTikTok(url)) { const m = url.match(/\/video\/(\d+)/); return m ? m[1] : null; }
    return null;
  }

  // ============================================
  // FEED INTERRUPTION INJECTION
  // ============================================
  function getCurrentPlatform() {
    const hostname = window.location.hostname.replace('www.', '');
    for (const platform of Object.keys(FEED_SELECTORS)) {
      if (hostname.includes(platform)) return platform;
    }
    return null;
  }

  function getInterruptionFrequency() {
    const intensity = settings?.interventionIntensity || 'medium';
    const base = intensity === 'light' ? 8 : intensity === 'heavy' ? 3 : 5;
    if (globalScore >= 20) return { interruption: base - 2, mirror: base + 3 };
    if (globalScore >= 10) return { interruption: base, mirror: base + 5 };
    if (globalScore >= 5) return { interruption: base + 2, mirror: null };
    return { interruption: null, mirror: null };
  }

  function buildInterruptionElement() {
    const el = document.createElement('div');
    el.className = 'doom-interruption';
    el.dataset.doomInjected = 'true';
    el.innerHTML = `<div class="doom-interruption-inner">${getRandomInterruption()}</div>`;
    return el;
  }

  function buildMirrorPost() {
    const platform = getCurrentPlatform();
    const minutes = globalSessionData?.sessionMinutes || 0;
    const score = globalScore;
    const attention = globalSessionData?.attentionCapacity || 100;
    const shorts = globalSessionData?.totalShortFormVideos || 0;
    const el = document.createElement('div');
    el.className = 'doom-mirror-post';
    el.dataset.doomInjected = 'true';

    if (platform === 'reddit.com') {
      el.innerHTML = `<div class="doom-mirror-reddit">
        <div class="doom-mirror-meta">Posted by u/you • just now</div>
        <div class="doom-mirror-title">${minutes} minutes of your life — gone</div>
        <div class="doom-mirror-divider"></div>
        <div class="doom-mirror-stats">
          <span>${shorts} shorts</span><span>•</span>
          <span>Doom ${score}</span><span>•</span><span>Attention ${attention}%</span>
        </div>
        <div class="doom-mirror-gap">Someone not scrolling is ${minutes} min ahead right now</div>
      </div>`;
    } else if (platform === 'youtube.com') {
      el.innerHTML = `<div class="doom-mirror-youtube">
        <div class="doom-mirror-thumb"><div class="doom-mirror-thumb-text">
          <div class="doom-mirror-thumb-time">${minutes}:00</div>
          <div class="doom-mirror-thumb-label">WASTED</div>
        </div></div>
        <div class="doom-mirror-info">
          <div class="doom-mirror-video-title">${minutes} minutes of your life — gone</div>
          <div class="doom-mirror-channel">You • just now</div>
          <div class="doom-mirror-views">Doom ${score} • Attention ${attention}%</div>
        </div>
      </div>`;
    } else if (platform === 'twitter.com' || platform === 'x.com') {
      el.innerHTML = `<div class="doom-mirror-twitter">
        <div class="doom-mirror-avatar">?</div>
        <div class="doom-mirror-content">
          <div class="doom-mirror-user">
            <span class="doom-mirror-name">You</span>
            <span class="doom-mirror-handle">@you</span>
            <span class="doom-mirror-dot">·</span>
            <span class="doom-mirror-time">now</span>
          </div>
          <div class="doom-mirror-text">${minutes} min gone. Doom: ${score} | Attention: ${attention}%<br>
            <span class="doom-mirror-subtle">Someone not scrolling is ${minutes} min ahead.</span>
          </div>
        </div>
      </div>`;
    } else if (platform === 'linkedin.com') {
      el.innerHTML = `<div class="doom-mirror-generic">
        <div class="doom-mirror-header">You • just now</div>
        <div class="doom-mirror-title">${minutes} minutes lost to the feed</div>
        <div class="doom-mirror-stats">
          <span>Doom: ${score}</span><span>Attention: ${attention}%</span>
        </div>
        <div class="doom-mirror-gap">This time could have been a skill, not a scroll.</div>
      </div>`;
    } else {
      el.innerHTML = `<div class="doom-mirror-generic">
        <div class="doom-mirror-header">You • just now</div>
        <div class="doom-mirror-title">${minutes} minutes — gone</div>
        <div class="doom-mirror-stats">
          <span>Doom: ${score}</span><span>Attention: ${attention}%</span><span>${shorts} shorts</span>
        </div>
        <div class="doom-mirror-gap">Someone not scrolling is ${minutes} min ahead right now</div>
      </div>`;
    }
    return el;
  }

  function injectFeedInterruptions() {
    if (sessionIntent === 'specific' || sessionIntent === 'notifications') return;
    if (!settings?.showInterruptions) return;
    const platform = getCurrentPlatform();
    if (!platform || !FEED_SELECTORS[platform]) return;
    const frequency = getInterruptionFrequency();
    if (!frequency.interruption && !frequency.mirror) return;
    const posts = document.querySelectorAll(FEED_SELECTORS[platform].post);
    posts.forEach((post) => {
      if (post.dataset.doomProcessed) return;
      post.dataset.doomProcessed = 'true';
      injectionCount++;
      if (frequency.mirror && injectionCount % frequency.mirror === 0) {
        post.parentNode?.insertBefore(buildMirrorPost(), post);
        return;
      }
      if (frequency.interruption && injectionCount % frequency.interruption === 0) {
        post.parentNode?.insertBefore(buildInterruptionElement(), post);
      }
    });
  }

  function setupFeedObserver() {
    const platform = getCurrentPlatform();
    if (!platform || !FEED_SELECTORS[platform]) return;
    setTimeout(injectFeedInterruptions, 1000);
    const feedSelector = FEED_SELECTORS[platform].feed;
    const feedContainer = document.querySelector(feedSelector);
    if (feedContainer && !feedObserver) {
      feedObserver = new MutationObserver(() => injectFeedInterruptions());
      feedObserver.observe(feedContainer, { childList: true, subtree: true });
    }
    setInterval(injectFeedInterruptions, 3000);
  }

  // ============================================
  // URL CHANGE DETECTION
  // ============================================
  function setupUrlChangeDetection() {
    new MutationObserver(() => {
      if (location.href !== lastUrl) { handleUrlChange(lastUrl, location.href); lastUrl = location.href; }
    }).observe(document, { subtree: true, childList: true });
    window.addEventListener('popstate', () => {
      if (location.href !== lastUrl) { handleUrlChange(lastUrl, location.href); lastUrl = location.href; }
    });
  }

  function handleUrlChange(oldUrl, newUrl) {
    const oldPlatform = getShortFormPlatform(oldUrl);
    const newPlatform = getShortFormPlatform(newUrl);
    if (newPlatform && !shortsSessionData.isActive) {
      shortsSessionData = { startTime: Date.now(), isActive: true, platform: newPlatform, uniqueVideos: [] };
    }
    if (newPlatform) {
      const videoId = extractVideoId(newUrl);
      if (videoId && !shortsSessionData.uniqueVideos.includes(videoId)) shortsSessionData.uniqueVideos.push(videoId);
      reportShortFormActivity();
      return;
    }
    if (oldPlatform && !newPlatform) {
      shortsSessionData = { startTime: null, isActive: false, platform: null, uniqueVideos: [] };
    }
    if (!newPlatform) localPageLoads++;
  }

  function reportShortFormActivity() {
    if (!shortsSessionData.isActive || !shortsSessionData.startTime) return;
    const minutesInShorts = (Date.now() - shortsSessionData.startTime) / 60000;
    const videosWatched = shortsSessionData.uniqueVideos.length;
    const typeMap = { youtube: 'SHORTS_ACTIVITY', instagram: 'REELS_ACTIVITY', tiktok: 'TIKTOK_ACTIVITY' };
    const msgType = typeMap[shortsSessionData.platform] || 'SHORTS_ACTIVITY';
    const payload = { type: msgType, site: window.location.hostname };
    if (shortsSessionData.platform === 'youtube') { payload.minutesInShorts = minutesInShorts; payload.shortsWatched = videosWatched; }
    else if (shortsSessionData.platform === 'instagram') { payload.minutesInReels = minutesInShorts; payload.reelsWatched = videosWatched; }
    else { payload.minutesOnTikTok = minutesInShorts; payload.tiktoksWatched = videosWatched; }
    chrome.runtime.sendMessage(payload);
  }

  // ============================================
  // BEHAVIOR TRACKING
  // ============================================
  function setupBehaviorTracking() {
    window.addEventListener('scroll', () => {
      localScrollCount++;
      const now = Date.now();
      scrollTimes.push(now);
      if (scrollTimes.length > 10) scrollTimes.shift();
      if (scrollTimes.length === 10 && (scrollTimes[9] - scrollTimes[0]) < 3000) {
        localVelocityHits++;
      }
    }, { passive: true });

    document.addEventListener('click', () => localClickCount++);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && sessionActive) showSessionEndFeedback();
    });

    window.addEventListener('beforeunload', () => {
      chrome.runtime.sendMessage({ type: 'TAB_CLOSING', url: window.location.href });
    });
  }

  function startActivityReporting() {
    setInterval(() => {
      if (!sessionActive) return;
      if (shortsSessionData.isActive) reportShortFormActivity();
      if (localScrollCount > 0 || localClickCount > 0 || localPageLoads > 0 || localVelocityHits > 0) {
        chrome.runtime.sendMessage({
          type: 'DOOM_ACTIVITY',
          scrollCount: localScrollCount,
          clickCount: localClickCount,
          pageLoads: localPageLoads,
          velocityHits: localVelocityHits,
          site: getSiteNameLocal()
        });
        localScrollCount = 0; localClickCount = 0; localPageLoads = 0; localVelocityHits = 0;
      }
    }, 2000);
  }

  function getSiteNameLocal() {
    const hostname = window.location.hostname.replace('www.', '');
    const sites = ['reddit.com', 'youtube.com', 'twitter.com', 'x.com', 'instagram.com',
                   'tiktok.com', 'facebook.com', 'linkedin.com', 'pinterest.com',
                   'twitch.tv', 'snapchat.com', 'threads.net'];
    for (const site of sites) { if (hostname.includes(site)) return site; }
    return hostname;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'GLOBAL_SCORE_UPDATE') {
      globalScore = message.score;
      globalLevel = message.level || 'Clear Mind';
      globalSessionData = message.sessionData;
      updateHUDDisplay();
      checkTimedInterventions();
    }
  });

  // ============================================
  // TIMED INTERVENTIONS
  // ============================================
  function checkTimedInterventions() {
    if (!globalSessionData || !settings) return;
    const minutes = globalSessionData.sessionMinutes || 0;

    // Redirect offer after X minutes
    if (settings.showRedirect && !redirectShown && minutes >= (settings.redirectAfterMinutes || 20)) {
      redirectShown = true;
      setTimeout(() => showRedirectOffer(minutes), 2000);
    }

    // Focus timer offer after 15 min if enabled
    if (settings.showFocusTimer && !focusOfferShown && !focusTimerActive && minutes >= 15) {
      focusOfferShown = true;
      setTimeout(() => showFocusOffer(minutes), 5000);
    }
  }

  // ============================================
  // INIT
  // ============================================
  async function init() {
    const response = await sendMessage({ type: 'CHECK_DOOM_SITE', url: window.location.href });
    if (!response?.isDoomSite) return;

    const data = await sendMessage({ type: 'GET_STATS' });
    settings = data?.settings;
    if (!settings?.enabled) return;

    const stateResponse = await sendMessage({ type: 'GET_GLOBAL_STATE' });
    if (stateResponse?.success) {
      globalScore = stateResponse.globalScore;
      globalLevel = stateResponse.level || 'Clear Mind';
      globalSessionData = stateResponse.sessionData;
    }

    if (settings.showIntentGate && !intentRecorded) {
      showIntentGate();
    } else {
      startSession('returning');
    }

    setupBehaviorTracking();
    setupUrlChangeDetection();
    startActivityReporting();

    if (settings.showLossMeter) createHUD();
    setupFeedObserver();
  }

  function sendMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }

  // ============================================
  // INTENT GATE
  // ============================================
  function showIntentGate() {
    const overlay = document.createElement('div');
    overlay.id = 'intent-gate-overlay';
    overlay.innerHTML = `
      <div class="intent-gate-modal">
        <div class="intent-gate-header">
          <div class="intent-gate-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 16v-4"></path><path d="M12 8h.01"></path>
            </svg>
          </div>
          <h2>Wait. Why are you here?</h2>
          <p class="intent-gate-subtitle">Be intentional about your time</p>
        </div>
        <div class="intent-gate-options">
          <button class="intent-option" data-intent="notifications">
            <span class="intent-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg></span>
            <span>Checking notifications</span>
          </button>
          <button class="intent-option" data-intent="specific">
            <span class="intent-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="M21 21l-4.35-4.35"></path></svg></span>
            <span>Looking for something specific</span>
          </button>
          <button class="intent-option" data-intent="browsing">
            <span class="intent-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></span>
            <span>Just browsing</span>
          </button>
        </div>
        <button class="intent-skip" data-intent="skipped">Skip (marks as mindless)</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-intent]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const intent = e.currentTarget.dataset.intent;
        intentRecorded = true;
        sessionIntent = intent;
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 300);
        startSession(intent);
        chrome.runtime.sendMessage({ type: 'INTENT_GATE_USED' });
      });
    });
  }

  async function startSession(intent) {
    sessionActive = true;
    sessionIntent = intent;
    await sendMessage({ type: 'TAB_SESSION_START', url: window.location.href, intent });
    setTimeout(setupFeedObserver, 500);
  }

  // ============================================
  // DOOM GUARD HUD (Enhanced)
  // ============================================
  function createHUD() {
    hudElement = document.createElement('div');
    hudElement.id = 'doomguard-hud';
    hudElement.innerHTML = `
      <div class="dg-hud-mini" id="dg-hud-mini">
        <div class="dg-mini-ring-wrapper">
          <svg viewBox="0 0 44 44" width="44" height="44">
            <circle class="dg-mini-ring-bg" cx="22" cy="22" r="17"/>
            <circle class="dg-mini-ring-fill" id="dg-mini-ring-fill" cx="22" cy="22" r="17"
                    stroke-dasharray="0 107" stroke-dashoffset="-27"/>
          </svg>
          <span class="dg-mini-score-text" id="dg-mini-score">0</span>
        </div>
        <button class="dg-expand-btn" id="dg-expand-btn" title="Expand DoomGuard">+</button>
      </div>

      <div class="dg-hud-full" id="dg-hud-full">
        <div class="dg-hud-header">
          <span class="dg-hud-logo">DoomGuard</span>
          <div class="dg-hud-controls">
            <button class="dg-hud-action-btn dg-breathe-trigger" id="dg-breathe-trigger" title="Breathing exercise">Breathe</button>
            <button class="dg-hud-action-btn dg-focus-trigger" id="dg-focus-trigger" title="Start focus timer">Focus</button>
            <button class="dg-minimize-btn" id="dg-minimize-btn" title="Minimize">-</button>
          </div>
        </div>

        <div class="dg-score-section">
          <div class="dg-score-ring-wrapper">
            <svg viewBox="0 0 90 90" width="90" height="90">
              <defs>
                <linearGradient id="dg-score-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#16a34a"/>
                  <stop offset="50%" stop-color="#d97706"/>
                  <stop offset="100%" stop-color="#dc2626"/>
                </linearGradient>
              </defs>
              <circle class="dg-ring-bg" cx="45" cy="45" r="37"/>
              <circle class="dg-ring-fill" id="dg-ring-fill" cx="45" cy="45" r="37"
                      stroke-dasharray="0 232" stroke-dashoffset="-58"/>
            </svg>
            <div class="dg-score-overlay">
              <span class="dg-score-num" id="dg-score-num">0</span>
              <span class="dg-score-level" id="dg-score-level">Clear</span>
            </div>
          </div>
        </div>

        <div class="dg-stats-row">
          <div class="dg-stat"><span class="dg-stat-val" id="dg-min-val">0</span><span class="dg-stat-lbl">min</span></div>
          <div class="dg-stat"><span class="dg-stat-val" id="dg-scroll-val">0</span><span class="dg-stat-lbl">scrolls</span></div>
          <div class="dg-stat"><span class="dg-stat-val" id="dg-shorts-val">0</span><span class="dg-stat-lbl">shorts</span></div>
        </div>

        <div class="dg-attention-row">
          <span class="dg-att-lbl">Attention</span>
          <div class="dg-att-bar"><div class="dg-att-fill" id="dg-att-fill" style="width:100%"></div></div>
          <span class="dg-att-pct" id="dg-att-pct">100%</span>
        </div>

        <div class="dg-comparison" id="dg-comparison"></div>
        <div id="dg-focus-timer-display" class="dg-focus-timer-row" style="display:none">
          <span class="dg-focus-timer-icon">Focus</span>
          <span class="dg-focus-timer-val" id="dg-focus-remaining">25:00</span>
        </div>
      </div>
    `;
    document.body.appendChild(hudElement);

    // Mini mode expand
    document.getElementById('dg-expand-btn').addEventListener('click', () => {
      hudMinimized = false;
      document.getElementById('dg-hud-mini').style.display = 'none';
      document.getElementById('dg-hud-full').style.display = 'block';
    });

    // Full mode minimize
    document.getElementById('dg-minimize-btn').addEventListener('click', () => {
      hudMinimized = true;
      document.getElementById('dg-hud-full').style.display = 'none';
      document.getElementById('dg-hud-mini').style.display = 'flex';
    });

    // Breathe button
    document.getElementById('dg-breathe-trigger').addEventListener('click', () => {
      if (!breathOverlayActive) showBreathingExercise();
    });

    // Focus button
    document.getElementById('dg-focus-trigger').addEventListener('click', () => {
      if (!focusTimerActive) startFocusTimer();
      else { clearInterval(focusInterval); focusTimerActive = false; document.getElementById('dg-focus-timer-display').style.display = 'none'; }
    });

    updateHUDDisplay();
  }

  function updateHUDDisplay() {
    if (!hudElement || !globalSessionData) return;
    const minutes = globalSessionData.sessionMinutes || 0;
    const score = globalScore;
    const attention = globalSessionData.attentionCapacity || 100;
    const shorts = globalSessionData.totalShortFormVideos || 0;
    const scrolls = globalSessionData.totalScrollCount || 0;

    // Mini ring
    const miniRingEl = document.getElementById('dg-mini-ring-fill');
    const miniScore = document.getElementById('dg-mini-score');
    if (miniRingEl) {
      const circ = 107;
      const fill = Math.min((score / 35) * circ, circ);
      miniRingEl.setAttribute('stroke-dasharray', `${fill} ${circ}`);
      const color = score < 10 ? '#16a34a' : score < 20 ? '#d97706' : '#dc2626';
      miniRingEl.setAttribute('stroke', color);
    }
    if (miniScore) miniScore.textContent = score;

    // Full ring
    const ringEl = document.getElementById('dg-ring-fill');
    if (ringEl) {
      const circ = 232;
      const fill = Math.min((score / 35) * circ, circ);
      ringEl.setAttribute('stroke-dasharray', `${fill} ${circ}`);
    }

    // Score text
    const scoreNum = document.getElementById('dg-score-num');
    const scoreLevel = document.getElementById('dg-score-level');
    if (scoreNum) scoreNum.textContent = score;
    if (scoreLevel) scoreLevel.textContent = globalLevel || 'Clear';

    // Stats
    const minEl = document.getElementById('dg-min-val');
    const scrollEl = document.getElementById('dg-scroll-val');
    const shortsEl = document.getElementById('dg-shorts-val');
    if (minEl) minEl.textContent = minutes;
    if (scrollEl) scrollEl.textContent = scrolls > 999 ? Math.floor(scrolls / 1000) + 'k' : scrolls;
    if (shortsEl) shortsEl.textContent = shorts;

    // Attention bar
    const attFill = document.getElementById('dg-att-fill');
    const attPct = document.getElementById('dg-att-pct');
    if (attFill) {
      attFill.style.width = `${attention}%`;
      attFill.style.background = attention > 60 ? '#16a34a' : attention > 30 ? '#d97706' : '#dc2626';
    }
    if (attPct) attPct.textContent = `${attention}%`;

    // Comparison text
    const compEl = document.getElementById('dg-comparison');
    if (compEl && minutes >= 1) {
      const now = Date.now();
      if (now - lastComparisonUpdate > 30000 || !currentComparison) {
        const pool = minutes < 5 ? ['10 deep breaths'] : minutes < 15 ? ['a short walk', 'reading 10 pages'] : ['a workout', 'a meditation session'];
        currentComparison = '= ' + pool[Math.floor(Math.random() * pool.length)];
        lastComparisonUpdate = now;
      }
      compEl.textContent = currentComparison;
      compEl.style.display = 'block';
    } else if (compEl) {
      compEl.style.display = 'none';
    }

    // HUD severity classes
    hudElement.classList.remove('warning', 'critical');
    if (score > 20 || attention < 30) hudElement.classList.add('critical');
    else if (score > 10 || attention < 60) hudElement.classList.add('warning');
  }

  // ============================================
  // BREATHING EXERCISE (4-7-8 Technique)
  // ============================================
  function showBreathingExercise(auto = false) {
    if (breathOverlayActive) return;
    breathOverlayActive = true;

    const overlay = document.createElement('div');
    overlay.id = 'dg-breathe-overlay';
    overlay.innerHTML = `
      <div class="dg-breathe-modal">
        <div class="dg-breathe-title">Reset Your Focus</div>
        <div class="dg-breathe-subtitle">4–7–8 Breathing Technique</div>
        <div class="dg-breathe-circle-wrapper">
          <div class="dg-breathe-circle" id="dg-breathe-circle"></div>
          <div class="dg-breathe-text-center">
            <span class="dg-breathe-action" id="dg-breathe-action">Get Ready</span>
            <span class="dg-breathe-count" id="dg-breathe-count"></span>
          </div>
        </div>
        <div class="dg-breathe-progress-bar">
          <div class="dg-breathe-progress-fill" id="dg-breathe-prog" style="width:0%"></div>
        </div>
        <p class="dg-breathe-desc" id="dg-breathe-desc">3 cycles · 57 seconds total</p>
        <button class="dg-breathe-skip" id="dg-breathe-skip">Skip</button>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('dg-breathe-skip').addEventListener('click', () => {
      overlay.remove();
      breathOverlayActive = false;
    });

    setTimeout(() => runBreathePhase(overlay, 3, 0, 0), 1500);
  }

  function runBreathePhase(overlay, totalCycles, cycle, phaseIndex) {
    if (!overlay.parentNode) return;
    const phases = [
      { name: 'Breathe In', duration: 4, scale: 1.45, color: '#16a34a' },
      { name: 'Hold', duration: 7, scale: 1.45, color: '#d97706' },
      { name: 'Breathe Out', duration: 8, scale: 1.0, color: '#dc2626' }
    ];
    const totalSecondsPerCycle = 19;
    const totalSeconds = totalCycles * totalSecondsPerCycle;

    if (cycle >= totalCycles) {
      const actionEl = overlay.querySelector('#dg-breathe-action');
      const countEl = overlay.querySelector('#dg-breathe-count');
      const descEl = overlay.querySelector('#dg-breathe-desc');
      const circleEl = overlay.querySelector('#dg-breathe-circle');
      if (actionEl) actionEl.textContent = 'Done';
      if (countEl) countEl.textContent = '';
      if (descEl) descEl.textContent = 'Focus reset. Scroll with intention.';
      if (circleEl) { circleEl.style.transform = 'scale(1)'; circleEl.style.borderColor = '#16a34a'; }
      overlay.querySelector('#dg-breathe-prog').style.width = '100%';
      chrome.runtime.sendMessage({ type: 'BREATHING_DONE' });
      setTimeout(() => { overlay.remove(); breathOverlayActive = false; }, 2500);
      return;
    }

    const phase = phases[phaseIndex];
    const circleEl = overlay.querySelector('#dg-breathe-circle');
    const actionEl = overlay.querySelector('#dg-breathe-action');
    const countEl = overlay.querySelector('#dg-breathe-count');

    if (actionEl) actionEl.textContent = phase.name;
    if (circleEl) {
      circleEl.style.transition = `transform ${phase.duration}s ease-in-out, border-color 0.5s ease`;
      circleEl.style.transform = `scale(${phase.scale})`;
      circleEl.style.borderColor = phase.color;
    }

    let timeLeft = phase.duration;
    if (countEl) countEl.textContent = timeLeft;

    const countInterval = setInterval(() => {
      if (!overlay.parentNode) { clearInterval(countInterval); return; }
      timeLeft--;
      if (countEl) countEl.textContent = Math.max(0, timeLeft);

      const phasesElapsed = cycle * totalSecondsPerCycle +
        [0, 4, 11][phaseIndex] + (phase.duration - timeLeft);
      const prog = overlay.querySelector('#dg-breathe-prog');
      if (prog) prog.style.width = `${(phasesElapsed / totalSeconds) * 100}%`;

      if (timeLeft <= 0) {
        clearInterval(countInterval);
        const nextPhase = phaseIndex + 1;
        if (nextPhase >= phases.length) {
          runBreathePhase(overlay, totalCycles, cycle + 1, 0);
        } else {
          runBreathePhase(overlay, totalCycles, cycle, nextPhase);
        }
      }
    }, 1000);
  }

  // ============================================
  // FOCUS TIMER (Pomodoro)
  // ============================================
  function showFocusOffer(minutes) {
    const overlay = document.createElement('div');
    overlay.id = 'dg-focus-overlay';
    overlay.innerHTML = `
      <div class="dg-focus-modal">
        <div class="dg-focus-icon-wrap">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path>
          </svg>
        </div>
        <h3 class="dg-focus-title">Switch to Focus Mode?</h3>
        <p class="dg-focus-desc">You've been doom scrolling for <strong>${minutes} minutes</strong>.<br>Start a 25-minute Pomodoro instead.</p>
        <div class="dg-focus-timer-preview">25:00</div>
        <div class="dg-focus-actions">
          <button class="dg-focus-start-btn" id="dg-focus-start">Start Focus Session</button>
          <button class="dg-focus-skip-btn" id="dg-focus-skip">Keep Scrolling</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('dg-focus-start').addEventListener('click', () => { overlay.remove(); startFocusTimer(); });
    document.getElementById('dg-focus-skip').addEventListener('click', () => overlay.remove());
  }

  function startFocusTimer() {
    if (focusTimerActive) return;
    focusTimerActive = true;
    focusTimeLeft = 25 * 60;
    chrome.runtime.sendMessage({ type: 'FOCUS_STARTED' });

    const timerRow = document.getElementById('dg-focus-timer-display');
    if (timerRow) timerRow.style.display = 'flex';

    focusInterval = setInterval(() => {
      focusTimeLeft--;
      const min = Math.floor(focusTimeLeft / 60);
      const sec = focusTimeLeft % 60;
      const display = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
      const el = document.getElementById('dg-focus-remaining');
      if (el) el.textContent = display;
      if (focusTimeLeft <= 0) {
        clearInterval(focusInterval);
        focusTimerActive = false;
        if (timerRow) timerRow.style.display = 'none';
        showFocusComplete();
      }
    }, 1000);
  }

  function showFocusComplete() {
    const overlay = document.createElement('div');
    overlay.id = 'dg-focus-complete-overlay';
    overlay.innerHTML = `<div class="dg-focus-modal">
      <div class="dg-focus-icon-wrap"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
      <h3 class="dg-focus-title" style="color:#16a34a">Focus Session Complete!</h3>
      <p class="dg-focus-desc">25 minutes of real work. XP earned.</p>
      <button class="dg-focus-start-btn" id="dg-fc-done">Continue</button>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('dg-fc-done').addEventListener('click', () => overlay.remove());
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 6000);
  }

  // ============================================
  // REDIRECT INTERVENTION
  // ============================================
  const PRODUCTIVE_SITES = [
    { name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Special:Random', desc: 'Random knowledge' },
    { name: 'Khan Academy', url: 'https://www.khanacademy.org', desc: 'Learn anything, free' },
    { name: 'GitHub Trending', url: 'https://github.com/trending', desc: "What developers are building" },
    { name: 'Hacker News', url: 'https://news.ycombinator.com', desc: 'Tech & startup ideas' },
    { name: 'Duolingo', url: 'https://www.duolingo.com', desc: 'Learn a language' },
    { name: 'Project Euler', url: 'https://projecteuler.net', desc: 'Math & logic puzzles' },
    { name: 'Coursera', url: 'https://www.coursera.org', desc: 'Free university courses' },
  ];

  function showRedirectOffer(minutes) {
    const sites = [...PRODUCTIVE_SITES].sort(() => Math.random() - 0.5).slice(0, 3);
    const overlay = document.createElement('div');
    overlay.id = 'dg-redirect-overlay';
    overlay.innerHTML = `
      <div class="dg-redirect-modal">
        <h3 class="dg-redirect-title">You've scrolled for ${minutes} minutes</h3>
        <p class="dg-redirect-sub">Try one of these instead:</p>
        <div class="dg-redirect-sites">
          ${sites.map(s => `<a href="${s.url}" target="_blank" class="dg-rsite">
            <span class="dg-rsite-name">${s.name}</span>
            <span class="dg-rsite-desc">${s.desc}</span>
          </a>`).join('')}
        </div>
        <button class="dg-redirect-skip" id="dg-redirect-skip">Stay Here</button>
      </div>`;
    document.body.appendChild(overlay);
    document.getElementById('dg-redirect-skip').addEventListener('click', () => overlay.remove());
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 30000);
  }

  // ============================================
  // SESSION END FEEDBACK
  // ============================================
  async function showSessionEndFeedback() {
    const response = await sendMessage({ type: 'GET_SESSION_SUMMARY' });
    if (!response?.success) return;
    sessionActive = false;
    const data = response.summary;
    if (data.minutesLost < 1) return;

    const costs = [];
    if (data.minutesLost >= 2) costs.push(`${Math.floor(data.minutesLost / 2)} pages of a book`);
    if (data.minutesLost >= 5) costs.push(`${Math.floor(data.minutesLost / 5)} real conversations`);
    if (data.minutesLost >= 10) costs.push(`${Math.floor(data.minutesLost / 10)} skill practice sessions`);

    let harshTruth = 'Another session absorbed into the void.';
    if (data.totalShortFormVideos > 10) harshTruth = `${data.totalShortFormVideos} shorts. Each one shortening your attention span.`;
    else if (data.sitesVisited?.length > 2) harshTruth = `Doom hopping across ${data.sitesVisited.length} sites. Focus fragmented.`;
    else if (data.velocityHits > 5) harshTruth = 'Fast-scrolling detected. Pure passive consumption.';
    else if (data.minutesLost > 30) harshTruth = 'Half an hour gone. What were you looking for?';

    const overlay = document.createElement('div');
    overlay.id = 'session-end-feedback';
    overlay.innerHTML = `
      <div class="feedback-modal">
        <div class="feedback-header">
          <div class="feedback-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg></div>
          <h2>That just cost you</h2>
        </div>
        <div class="feedback-main-stat">
          <span class="main-stat-value">${data.minutesLost}</span>
          <span class="main-stat-label">minutes</span>
        </div>
        <div class="feedback-costs">${costs.slice(0, 3).map(c => `<div class="cost-item"><span class="cost-equals">=</span><span class="cost-text">${c}</span></div>`).join('')}</div>
        <div class="feedback-truth"><p>${harshTruth}</p></div>
        <div class="feedback-aftermath">
          <div class="aftermath-item"><span class="aftermath-label">Attention</span><span class="aftermath-value ${data.attentionCapacity < 50 ? 'critical' : ''}">${data.attentionCapacity}%</span></div>
          <div class="aftermath-item"><span class="aftermath-label">Recovery</span><span class="aftermath-value">${data.recoveryTime}min</span></div>
          <div class="aftermath-item"><span class="aftermath-label">Memory</span><span class="aftermath-value ${data.memoryRetention < 20 ? 'critical' : ''}">${data.memoryRetention}%</span></div>
        </div>
        ${data.sitesVisited?.length > 1 ? `<div class="feedback-hopping">Doom hopped: ${data.sitesVisited.join(' → ')}</div>` : ''}
        <div class="feedback-gap-final"><p>While you scrolled, someone used those ${data.minutesLost} minutes to get ahead.</p></div>
        <button class="feedback-close">I understand</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.feedback-close').addEventListener('click', () => {
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 300);
    });
    setTimeout(() => { if (overlay.parentNode) { overlay.classList.add('fade-out'); setTimeout(() => overlay.remove(), 300); } }, 15000);
  }

  // ============================================
  // START
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
