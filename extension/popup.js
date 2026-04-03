// DoomGuard Popup Script v2

const DEFAULT_SITES = [
  'reddit.com', 'youtube.com', 'twitter.com / x.com', 'instagram.com',
  'tiktok.com', 'facebook.com', 'linkedin.com', 'pinterest.com',
  'twitch.tv', 'snapchat.com', 'threads.net'
];

const DEFAULT_SITES_CLEAN = [
  'reddit.com', 'youtube.com', 'twitter.com', 'instagram.com',
  'tiktok.com', 'facebook.com', 'linkedin.com', 'pinterest.com',
  'twitch.tv', 'snapchat.com', 'threads.net'
];

const BADGE_DEFS = [
  { id: 'first_clean', name: 'First Step',    icon: 'V',  desc: 'First clean day' },
  { id: 'streak_3',   name: 'Streak 3',       icon: '3x', desc: '3-day clean streak' },
  { id: 'streak_7',   name: 'Week Warrior',   icon: '7x', desc: '7-day clean streak' },
  { id: 'streak_30',  name: 'Month Master',   icon: '30', desc: '30-day clean streak' },
  { id: 'quick_check',name: 'Quick Check',    icon: 'QC', desc: 'Session under 5 min' },
  { id: 'early_bird', name: 'Early Bird',     icon: 'EB', desc: 'No doom before 9am x5' },
  { id: 'night_free', name: 'Night Guard',    icon: 'NG', desc: 'No doom after 10pm x5' },
  { id: 'breath_5',   name: 'Breather',       icon: 'BR', desc: '5 breathing sessions' },
  { id: 'breath_25',  name: 'Breath Master',  icon: 'BM', desc: '25 breathing sessions' },
  { id: 'focus_5',    name: 'Focused',        icon: 'FO', desc: '5 Pomodoro sessions' },
  { id: 'intent_50',  name: 'Intentional',    icon: 'IN', desc: 'Intent gate 50 times' },
  { id: 'low_score',  name: 'Mindful',        icon: 'MS', desc: 'Doom score < 5 all day' },
];

const DOOM_LEVELS = [
  { min: 0,  max: 5,  label: 'Clear Mind',  color: '#16a34a' },
  { min: 5,  max: 10, label: 'Drifting',    color: '#65a30d' },
  { min: 10, max: 15, label: 'Sliding',     color: '#d97706' },
  { min: 15, max: 20, label: 'Spiraling',   color: '#ea580c' },
  { min: 20, max: 30, label: 'In the Loop', color: '#dc2626' },
  { min: 30, max: Infinity, label: 'Deep Doom', color: '#991b1b' },
];

function getDoomLevel(score) {
  return DOOM_LEVELS.find(l => score >= l.min && score < l.max) || DOOM_LEVELS[DOOM_LEVELS.length - 1];
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupTabs();
  await loadAll();
  setupEventListeners();
}

async function loadAll() {
  const { stats, settings } = await chrome.storage.local.get(['stats', 'settings']);

  if (!stats || !settings) return;

  const today = new Date().toDateString();
  if (stats.lastResetDate !== today) {
    stats.dailyHistory.push({
      date: stats.lastResetDate,
      minutesLost: stats.totalMinutesLost,
      sessions: stats.sessionsToday
    });
    if (stats.dailyHistory.length > 30) stats.dailyHistory.shift();
    stats.totalMinutesLost = 0;
    stats.sessionsToday = 0;
    stats.lastResetDate = today;
    await chrome.storage.local.set({ stats });
  }

  renderOverview(stats, settings);
  renderAnalytics(stats);
  renderSites(settings);
  renderSettings(settings);
}

// ============================================
// OVERVIEW TAB
// ============================================
function renderOverview(stats, settings) {
  const score = stats.todayDoomScore || 0;
  const level = getDoomLevel(score);

  // Score ring (circumference of r=48 = 301.6)
  const circ = 301;
  const fill = Math.min((score / 35) * circ, circ);
  const ringEl = document.getElementById('score-ring-fill');
  if (ringEl) {
    ringEl.setAttribute('stroke-dasharray', `${fill} ${circ}`);
    ringEl.style.stroke = level.color;
    ringEl.style.transition = 'stroke-dasharray 0.8s ease, stroke 0.5s ease';
  }

  document.getElementById('doom-score-display').textContent = score;
  document.getElementById('doom-level-display').textContent = level.label;
  document.getElementById('doom-level-display').style.color = level.color;

  // Streak
  const streak = stats.streak?.current || 0;
  document.getElementById('streak-display').textContent = streak;

  // XP / Level
  const xp = stats.xp || 0;
  const lvl = stats.level || 1;
  const progress = stats.levelProgress || 0;
  document.getElementById('xp-level-label').textContent = `Lvl ${lvl}`;
  document.getElementById('xp-points-label').textContent = `${xp} XP`;
  document.getElementById('xp-bar-fill').style.width = `${progress}%`;

  // Stats grid
  document.getElementById('today-minutes').textContent = stats.totalMinutesLost || 0;
  document.getElementById('sessions-count').textContent = stats.sessionsToday || 0;
  document.getElementById('scrolls-count').textContent = formatNum(stats.todayScrolls || 0);
  document.getElementById('shorts-count').textContent = stats.todayShorts || 0;

  // Recovery
  const minutes = stats.totalMinutesLost || 0;
  const recoveryTime = Math.floor(minutes * 0.44);
  const recoveredPct = Math.min(100, Math.max(5, 100 - minutes * 2));
  document.getElementById('recovery-fill').style.width = `${recoveredPct}%`;
  document.getElementById('recovery-pct').textContent = `${recoveredPct}%`;
  document.getElementById('recovery-time').textContent =
    recoveryTime === 0 ? 'Fully recovered' : `~${recoveryTime} min to full recovery`;

  // Recovery bar color
  const rFill = document.getElementById('recovery-fill');
  if (rFill) {
    rFill.style.background = recoveredPct > 60 ? '#16a34a' : recoveredPct > 30 ? '#d97706' : '#dc2626';
  }

  // Badges
  renderBadges(stats.badges || []);
}

function renderBadges(earnedIds) {
  const grid = document.getElementById('badges-grid');
  const count = document.getElementById('badges-count');
  if (!grid) return;
  grid.innerHTML = '';
  if (count) count.textContent = `${earnedIds.length} / ${BADGE_DEFS.length}`;

  BADGE_DEFS.forEach(badge => {
    const earned = earnedIds.includes(badge.id);
    const el = document.createElement('div');
    el.className = `badge-item ${earned ? 'earned' : 'locked'}`;
    el.title = `${badge.name}: ${badge.desc}`;
    el.innerHTML = `
      <div class="badge-icon">${badge.icon}</div>
      <div class="badge-name">${badge.name}</div>
    `;
    grid.appendChild(el);
  });
}

// ============================================
// ANALYTICS TAB
// ============================================
function renderAnalytics(stats) {
  renderWeeklyChart(stats);
  renderHeatmap(stats);
  renderPlatformBreakdown(stats);
  renderBestWorstDays(stats);
}

function renderWeeklyChart(stats) {
  const chart = document.getElementById('weekly-chart');
  const weeklyLabel = document.getElementById('weekly-total-label');
  if (!chart) return;
  chart.innerHTML = '';

  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
  const weekData = [];

  for (let i = 0; i < 7; i++) {
    const isToday = i === dayOfWeek;
    let minutes = 0;
    if (isToday) {
      minutes = stats.totalMinutesLost || 0;
    } else {
      const histIdx = stats.dailyHistory.length - (dayOfWeek - i + 7) % 7;
      if (histIdx >= 0 && stats.dailyHistory[histIdx]) {
        minutes = stats.dailyHistory[histIdx].minutesLost || 0;
      }
    }
    weekData.push({ minutes, isToday });
  }

  const maxMinutes = Math.max(...weekData.map(d => d.minutes), 30);
  const weeklyTotal = weekData.reduce((s, d) => s + d.minutes, 0);
  if (weeklyLabel) weeklyLabel.textContent = `${weeklyTotal} min this week`;

  weekData.forEach(day => {
    const bar = document.createElement('div');
    bar.className = `chart-bar ${day.isToday ? 'today' : ''}`;
    const h = day.minutes > 0 ? Math.max(6, (day.minutes / maxMinutes) * 100) : 4;
    bar.style.height = `${h}%`;
    bar.setAttribute('data-value', `${day.minutes}m`);
    chart.appendChild(bar);
  });
}

function renderHeatmap(stats) {
  const grid = document.getElementById('heatmap-grid');
  const worstLabel = document.getElementById('heatmap-worst-label');
  if (!grid) return;
  grid.innerHTML = '';

  const hourly = stats.hourlyActivity || new Array(24).fill(0);
  const maxVal = Math.max(...hourly, 1);

  let worstHour = 0;
  let worstVal = 0;

  hourly.forEach((val, hour) => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    const intensity = val / maxVal;
    if (intensity === 0) {
      cell.style.background = 'var(--doom-surface-2)';
      cell.style.opacity = '0.5';
    } else if (intensity < 0.3) {
      cell.style.background = 'rgba(217, 119, 6, 0.3)';
    } else if (intensity < 0.6) {
      cell.style.background = 'rgba(234, 88, 12, 0.6)';
    } else {
      cell.style.background = `rgba(220, 38, 38, ${0.5 + intensity * 0.5})`;
    }
    cell.title = `${hour}:00 — ${val} min`;
    grid.appendChild(cell);
    if (val > worstVal) { worstVal = val; worstHour = hour; }
  });

  if (worstLabel && worstVal > 0) {
    const ampm = worstHour >= 12 ? 'pm' : 'am';
    const h = worstHour > 12 ? worstHour - 12 : worstHour || 12;
    worstLabel.textContent = `Peak: ${h}${ampm}`;
  }
}

function renderPlatformBreakdown(stats) {
  const list = document.getElementById('platforms-list');
  if (!list) return;

  const siteStats = stats.siteStats || {};
  const sites = Object.entries(siteStats).filter(([, s]) => s.sessions > 0);

  if (sites.length === 0) {
    list.innerHTML = '<div class="no-data-msg">No session data yet</div>';
    return;
  }

  const totalMin = Math.max(stats.totalMinutesLost || 1, 1);
  list.innerHTML = '';

  sites.sort((a, b) => (b[1].minutes || 0) - (a[1].minutes || 0))
       .forEach(([site, data]) => {
    const pct = Math.round(((data.minutes || 0) / totalMin) * 100);
    const row = document.createElement('div');
    row.className = 'platform-row';
    row.innerHTML = `
      <div class="platform-info">
        <span class="platform-name">${site}</span>
        <span class="platform-sessions">${data.sessions || 0} sessions</span>
      </div>
      <div class="platform-bar-wrap">
        <div class="platform-bar-fill" style="width:${Math.max(pct, 3)}%"></div>
      </div>
      <span class="platform-pct">${pct}%</span>`;
    list.appendChild(row);
  });
}

function renderBestWorstDays(stats) {
  const container = document.getElementById('bestworst-row');
  if (!container || !stats.dailyHistory || stats.dailyHistory.length < 2) {
    if (container) container.innerHTML = '<div class="no-data-msg">Need 2+ days of data</div>';
    return;
  }

  const history = stats.dailyHistory;
  const sorted = [...history].sort((a, b) => a.minutesLost - b.minutesLost);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  container.innerHTML = `
    <div class="bestworst-card best">
      <span class="bw-label">Best Day</span>
      <span class="bw-date">${formatDate(best.date)}</span>
      <span class="bw-value">${best.minutesLost}m</span>
    </div>
    <div class="bestworst-card worst">
      <span class="bw-label">Worst Day</span>
      <span class="bw-date">${formatDate(worst.date)}</span>
      <span class="bw-value">${worst.minutesLost}m</span>
    </div>`;
}

// ============================================
// SITES TAB
// ============================================
function renderSites(settings) {
  renderDefaultSites(settings);
  renderCustomSites(settings);
}

function renderDefaultSites(settings) {
  const list = document.getElementById('default-sites-list');
  if (!list) return;
  list.innerHTML = '';
  const disabled = settings.disabledSites || [];

  DEFAULT_SITES.forEach((site, i) => {
    const cleanSite = DEFAULT_SITES_CLEAN[i] || site;
    const isEnabled = !disabled.includes(cleanSite);
    const item = document.createElement('div');
    item.className = 'site-item';
    item.innerHTML = `
      <span class="site-name">${site}</span>
      <label class="toggle-switch small">
        <input type="checkbox" class="site-toggle" data-site="${cleanSite}" ${isEnabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>`;
    list.appendChild(item);
  });

  list.querySelectorAll('.site-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const site = e.target.dataset.site;
      const { settings: s } = await chrome.storage.local.get(['settings']);
      let disabled = s.disabledSites || [];
      if (e.target.checked) disabled = disabled.filter(d => d !== site);
      else if (!disabled.includes(site)) disabled.push(site);
      await updateSetting('disabledSites', disabled);
    });
  });
}

function renderCustomSites(settings) {
  const list = document.getElementById('custom-sites-list');
  const noCustom = document.getElementById('no-custom-sites');
  const customSites = settings.customDoomSites || [];

  if (list) {
    list.innerHTML = '';
    if (customSites.length === 0) {
      if (noCustom) noCustom.style.display = 'block';
    } else {
      if (noCustom) noCustom.style.display = 'none';
      customSites.forEach(site => {
        const item = document.createElement('div');
        item.className = 'site-item custom-site-item';
        item.innerHTML = `
          <span class="site-name">${site}</span>
          <button class="remove-site-btn" data-site="${site}">Remove</button>`;
        list.appendChild(item);
      });

      list.querySelectorAll('.remove-site-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const site = e.target.dataset.site;
          const { settings: s } = await chrome.storage.local.get(['settings']);
          const updated = (s.customDoomSites || []).filter(x => x !== site);
          await updateSetting('customDoomSites', updated);
          await loadAll();
        });
      });
    }
  }
}

// ============================================
// SETTINGS TAB
// ============================================
function renderSettings(settings) {
  const toggleMap = {
    'intent-gate-toggle': 'showIntentGate',
    'loss-meter-toggle': 'showLossMeter',
    'interruptions-toggle': 'showInterruptions',
    'breathing-toggle': 'showBreathing',
    'focus-toggle': 'showFocusTimer',
    'redirect-toggle': 'showRedirect'
  };

  Object.entries(toggleMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.checked = settings[key] !== false;
  });

  // Intensity
  const intensity = settings.interventionIntensity || 'medium';
  document.querySelectorAll('.intensity-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === intensity);
  });
  updateIntensityDesc(intensity);

  // Threshold
  const threshInput = document.getElementById('threshold-input');
  if (threshInput) threshInput.value = settings.cleanDayThreshold || 30;
}

function updateIntensityDesc(level) {
  const desc = document.getElementById('intensity-desc');
  if (!desc) return;
  const map = {
    light: 'Interruptions every 8th post',
    medium: 'Interruptions every 5th post',
    heavy: 'Interruptions every 3rd post'
  };
  desc.textContent = map[level] || '';
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Main enable toggle
  document.getElementById('enabled-toggle').addEventListener('change', async (e) => {
    await updateSetting('enabled', e.target.checked);
  });

  // Settings toggles
  const toggleMap = {
    'intent-gate-toggle': 'showIntentGate',
    'loss-meter-toggle': 'showLossMeter',
    'interruptions-toggle': 'showInterruptions',
    'breathing-toggle': 'showBreathing',
    'focus-toggle': 'showFocusTimer',
    'redirect-toggle': 'showRedirect'
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => updateSetting(key, e.target.checked));
  });

  // Intensity buttons
  document.querySelectorAll('.intensity-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.intensity-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const level = e.target.dataset.level;
      updateSetting('interventionIntensity', level);
      updateIntensityDesc(level);
    });
  });

  // Threshold input
  const threshInput = document.getElementById('threshold-input');
  if (threshInput) {
    threshInput.addEventListener('change', (e) => {
      const val = parseInt(e.target.value);
      if (val >= 5 && val <= 120) updateSetting('cleanDayThreshold', val);
    });
  }

  // Reset today
  document.getElementById('reset-stats')?.addEventListener('click', async () => {
    if (confirm('Reset today\'s statistics?')) {
      const { stats } = await chrome.storage.local.get(['stats']);
      stats.totalMinutesLost = 0;
      stats.sessionsToday = 0;
      stats.todayScrolls = 0;
      stats.todayShorts = 0;
      stats.todayDoomScore = 0;
      await chrome.storage.local.set({ stats });
      chrome.runtime.sendMessage({ type: 'RESET_SESSION' });
      await loadAll();
    }
  });

  // Reset all data
  document.getElementById('reset-all-data')?.addEventListener('click', async () => {
    if (confirm('⚠ Reset ALL data including streak and badges? This cannot be undone.')) {
      const today = new Date().toDateString();
      await chrome.storage.local.set({
        stats: {
          totalMinutesLost: 0, sessionsToday: 0, lastResetDate: today,
          dailyHistory: [], weeklyTotal: 0, hourlyActivity: new Array(24).fill(0),
          siteStats: {}, streak: { current: 0, longest: 0, lastDate: null },
          badges: [], xp: 0, breathSessions: 0, focusSessions: 0,
          intentGateUsed: 0, earlyMorningCleanDays: 0, lateNightCleanDays: 0,
          todayScrolls: 0, todayShorts: 0, todayDoomScore: 0
        }
      });
      chrome.runtime.sendMessage({ type: 'RESET_SESSION' });
      await loadAll();
    }
  });

  // Breathe now
  document.getElementById('breathe-now-btn')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_BREATHING' });
      }
    });
    window.close();
  });

  // Add custom site
  document.getElementById('add-site-btn')?.addEventListener('click', addCustomSite);
  document.getElementById('custom-site-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustomSite();
  });
}

async function addCustomSite() {
  const input = document.getElementById('custom-site-input');
  if (!input) return;
  let site = input.value.trim().toLowerCase()
    .replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0];
  if (!site || !site.includes('.')) return;
  const { settings } = await chrome.storage.local.get(['settings']);
  const custom = settings.customDoomSites || [];
  if (!custom.includes(site)) {
    custom.push(site);
    await updateSetting('customDoomSites', custom);
    input.value = '';
    await loadAll();
  }
}

// ============================================
// TAB SWITCHING
// ============================================
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      const tabEl = document.getElementById(`tab-${tab}`);
      if (tabEl) tabEl.classList.add('active');
    });
  });
}

// ============================================
// HELPERS
// ============================================
async function updateSetting(key, value) {
  const { settings } = await chrome.storage.local.get(['settings']);
  if (!settings) return;
  settings[key] = value;
  await chrome.storage.local.set({ settings });
  chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings: { [key]: value } });
}

function formatNum(n) {
  if (n >= 1000) return Math.floor(n / 1000) + 'k';
  return String(n);
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}
