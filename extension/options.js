// DoomGuard Options Page Script

const BADGE_DEFS = [
  { id: 'first_clean', name: 'First Step',    icon: 'V',  desc: 'First clean day under 30min' },
  { id: 'streak_3',   name: 'Streak Starter', icon: '3x', desc: '3-day clean streak' },
  { id: 'streak_7',   name: 'Week Warrior',   icon: '7x', desc: '7-day clean streak' },
  { id: 'streak_30',  name: 'Month Master',   icon: '30', desc: '30-day clean streak' },
  { id: 'quick_check',name: 'Quick Check',    icon: 'QC', desc: 'Session under 5 minutes' },
  { id: 'early_bird', name: 'Early Bird',     icon: 'EB', desc: 'No doom before 9am (5 days)' },
  { id: 'night_free', name: 'Night Guardian', icon: 'NG', desc: 'No doom after 10pm (5 days)' },
  { id: 'breath_5',   name: 'Breather',       icon: 'BR', desc: '5 breathing sessions done' },
  { id: 'breath_25',  name: 'Breath Master',  icon: 'BM', desc: '25 breathing sessions done' },
  { id: 'focus_5',    name: 'Focused',        icon: 'FO', desc: '5 Pomodoro sessions completed' },
  { id: 'intent_50',  name: 'Intentional',    icon: 'IN', desc: 'Intent gate used 50 times' },
  { id: 'low_score',  name: 'Mindful',        icon: 'MS', desc: 'Doom score < 5 all day' },
];

document.addEventListener('DOMContentLoaded', async () => {
  const { stats, settings } = await chrome.storage.local.get(['stats', 'settings']);
  if (!stats || !settings) return;

  // Lifetime stats
  document.getElementById('ls-streak').textContent = stats.streak?.longest || 0;
  document.getElementById('ls-breath').textContent = stats.breathSessions || 0;
  document.getElementById('ls-focus').textContent = stats.focusSessions || 0;

  // Settings
  document.getElementById('opt-threshold').value = settings.cleanDayThreshold || 30;
  document.getElementById('opt-redirect-after').value = settings.redirectAfterMinutes || 20;
  document.getElementById('opt-intensity').value = settings.interventionIntensity || 'medium';
  document.getElementById('opt-intent-gate').checked = settings.showIntentGate !== false;
  document.getElementById('opt-loss-meter').checked = settings.showLossMeter !== false;
  document.getElementById('opt-interruptions').checked = settings.showInterruptions !== false;
  document.getElementById('opt-breathing').checked = settings.showBreathing !== false;
  document.getElementById('opt-focus-timer').checked = settings.showFocusTimer !== false;
  document.getElementById('opt-redirect').checked = settings.showRedirect !== false;

  // Badges
  const earned = stats.badges || [];
  const grid = document.getElementById('badge-grid');
  if (grid) {
    grid.innerHTML = '';
    BADGE_DEFS.forEach(badge => {
      const isEarned = earned.includes(badge.id);
      const card = document.createElement('div');
      card.className = `badge-card ${isEarned ? 'earned' : ''}`;
      card.innerHTML = `
        <div class="badge-card-icon">${badge.icon}</div>
        <h4>${badge.name}</h4>
        <p>${badge.desc}</p>
        ${isEarned ? '<p style="color:#16a34a;font-size:10px;margin-top:6px;font-weight:600">EARNED</p>' : '<p style="color:#555;font-size:10px;margin-top:6px">Locked</p>'}`;
      grid.appendChild(card);
    });
  }

  // Save button
  document.getElementById('save-btn').addEventListener('click', async () => {
    const newSettings = {
      cleanDayThreshold: parseInt(document.getElementById('opt-threshold').value) || 30,
      redirectAfterMinutes: parseInt(document.getElementById('opt-redirect-after').value) || 20,
      interventionIntensity: document.getElementById('opt-intensity').value,
      showIntentGate: document.getElementById('opt-intent-gate').checked,
      showLossMeter: document.getElementById('opt-loss-meter').checked,
      showInterruptions: document.getElementById('opt-interruptions').checked,
      showBreathing: document.getElementById('opt-breathing').checked,
      showFocusTimer: document.getElementById('opt-focus-timer').checked,
      showRedirect: document.getElementById('opt-redirect').checked,
    };

    const { settings: existing } = await chrome.storage.local.get(['settings']);
    await chrome.storage.local.set({ settings: { ...existing, ...newSettings } });

    const successEl = document.getElementById('save-success');
    if (successEl) {
      successEl.style.display = 'inline';
      setTimeout(() => { successEl.style.display = 'none'; }, 2500);
    }
  });

  // Export JSON
  document.getElementById('export-btn').addEventListener('click', async () => {
    const { stats: s } = await chrome.storage.local.get(['stats']);
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `doomguard-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Reset all
  document.getElementById('reset-all-btn').addEventListener('click', async () => {
    if (!confirm('Reset ALL data? This cannot be undone.')) return;
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
    alert('All data reset.');
    location.reload();
  });
});
