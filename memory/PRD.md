# DoomGuard – Anti Scroll Engine v2.0

## Original Problem Statement
"Upgrade this anti doom scroller" — Chrome extension that detects and combats doomscrolling behavior.

## User Choices
- No AI (all local processing)
- Better/redesigned popup UI (nicer visuals, charts, animations)
- Smarter doom detection (local heuristics)
- More intervention types (breathing exercises, redirect to productive sites, study timer)
- Streak & gamification system (daily streaks, badges, scores)
- Custom site list management (add/remove own doom sites)
- More platforms supported (LinkedIn, Pinterest, Twitch, etc.)
- Real-time overlay/HUD on doom sites (floating stats while browsing)
- Stats dashboard with deeper analytics (best/worst days, hourly heatmap)

## Architecture

### Extension Files
```
extension/
├── manifest.json          # MV3, 12 platforms, alarms+notifications permissions
├── background.js          # Service worker — scoring engine, streak, badges, XP
├── content.js             # Content script — HUD, interventions, tracking
├── popup.html             # 4-tab popup UI
├── popup.js               # Popup logic — charts, heatmap, sites, settings
├── options.html           # Advanced settings page
├── options.js             # Options logic — lifetime stats, export, reset
├── css/popup.css          # Dark red neon theme, score ring, badges, heatmap
├── css/content.css        # HUD, breathing overlay, focus timer, redirect modal
└── icons/                 # icon16.png, icon48.png, icon128.png
```

## What's Been Implemented (v2.0) — 2025-02

### Enhanced Detection (Local)
- **Scroll velocity tracking**: fast scroll bursts = passive consumption flag
- **Doom loop detection**: A→B→A→B site-hopping pattern penalty
- **Binge detection**: same site > 20 min gets extra penalty
- **Multi-platform support**: 12 sites (added LinkedIn, Pinterest, Twitch, Snapchat, Threads)
- **Time-of-day multiplier**: enhanced 1.0x–2.5x range

### Gamification System
- **Streak tracking**: consecutive "clean days" (under configurable threshold)
- **12 Badges**: First Step, Streak 3/7/30, Quick Check, Early Bird, Night Guardian, Breather, Breath Master, Focused, Intentional, Mindful
- **XP & 10 Levels**: earned via streaks, breathe/focus sessions, intent gate use
- **Doom Levels**: Clear Mind → Drifting → Sliding → Spiraling → In the Loop → Deep Doom

### New Interventions
- **Breathing Exercise**: 4-7-8 technique overlay with animated ring, 3-cycle countdown, progress bar
- **Focus Timer (Pomodoro)**: 25-minute countdown, shown in HUD, XP reward on completion
- **Redirect Modal**: after configurable minutes, suggest Wikipedia/Khan/GitHub/Duolingo/etc.
- **Session end feedback**: preserved + enhanced with velocity data

### Redesigned Popup (4 Tabs)
- **Overview**: Score ring (SVG gradient, glow), streak+XP bar, 4-stat grid, recovery bar, 12-badge grid, quick actions
- **Analytics**: Weekly bar chart, 24-hour heatmap, platform breakdown, best/worst days
- **Sites**: Default sites (toggleable individually), custom sites (add/remove), live sync to background
- **Settings**: 6 feature toggles, intensity selector, clean-day threshold, danger zone

### Real-time HUD
- **Mini mode**: small score ring pill, expand button
- **Full mode**: SVG score ring, stats row (min/scrolls/shorts), attention bar, comparison text, focus timer display
- **Breathe** and **Focus** buttons inline
- Warning/critical pulse animation

### Options Page
- Lifetime stats display
- All settings with full descriptions
- All 12 badges with locked/earned states
- JSON export
- Full data reset

## Platforms Tracked
reddit.com, youtube.com, twitter.com, x.com, instagram.com, tiktok.com, facebook.com, **linkedin.com**, **pinterest.com**, **twitch.tv**, **snapchat.com**, **threads.net** + unlimited custom sites

## Tech Stack
- Chrome Extension Manifest V3
- Vanilla JS (no frameworks)
- SVG animations for score rings
- CSS custom properties + keyframe animations

## Install Instructions
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

## Backlog / P1
- [ ] Smooth animated counter (number roll-up on popup open)
- [ ] Per-site time limits with hard block
- [ ] Weekly email/notification summary
- [ ] White-list mode (only allow specific sites)
- [ ] Import stats from previous version

## v2.1 — Neurological Interventions (Jul 2025)

### Feature: Grayscale Shift (Variable Reward Killer)
- After **3 minutes of continuous feed scrolling**, injects CSS `filter: grayscale(100%)` on `<html>`
- 10-second ease-in transition drains color from the entire page
- Without visual candy, dopamine release drops and the urge to scroll decreases
- Toast notification confirms the shift; HUD shows "B&W" badge
- Resets gracefully if score drops (2s ease-out)

### Feature: Context Switching Tax
- Tracks tab-hops between **blacklisted doom sites** within a **5-minute sliding window**
- More than **3 switches** in 5 min triggers a score multiplier: `1 + (hops - 3) × 0.5x`
  - 4 hops → 1.5× | 5 hops → 2× | 6 hops → 2.5×
- Doom Score multiplied in `recalculateGlobalScore()` — targets scattered low-attention state
- HUD shows pulsing orange "⚡ N tab-hops — Nx Score Tax" banner

### Feature: Aggressive Audio Interrupt
- When Doom Score enters **Deep Doom (≥ 30)**, fires a jarring snare + bass slap sound
- Synthesized 100% via Web Audio API — no audio files needed
- Components: white-noise snare burst (bandpass 2500Hz), bass oscillator pitch-drop (200→40Hz), sharp click transient
- 90-second cooldown to avoid repeat spam; resets when score drops below 30
- Bypasses visual-only tunnel-vision — snaps user out of dopamine loop on a sensory level
