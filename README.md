
# DoomGuard v2 — Anti Scroll Engine

DoomGuard is a lightweight, privacy-first Chrome extension that detects and interrupts doomscrolling behavior in real time. It runs entirely locally — no API keys, no data collection, no external servers. Everything stays on your device.

---

## Features

### Intelligent Local Detection
DoomGuard tracks behavioral patterns rather than just time spent on a page. It monitors scroll velocity to detect mindless scrolling, recognizes doom-loop patterns (bouncing between the same two tabs repeatedly), flags binge sessions, and applies a 2.5x late-night multiplier after hours when doomscrolling is most likely.
<img width="497" height="767" alt="image" src="https://github.com/user-attachments/assets/f6c39d85-dfa1-48a4-ae0a-64c2aad64588" />

### Interventions
When a doom session is detected, DoomGuard can trigger one of three interventions depending on your settings. The 4-7-8 Breathing Exercise presents an animated breathing ring with a guided countdown. The Pomodoro Focus Timer launches a 25-minute focus session with a live HUD display. The Redirect Modal prompts you to visit a productive destination — Wikipedia, Khan Academy, GitHub, or Duolingo — after a configurable time threshold.
<img width="516" height="487" alt="image" src="https://github.com/user-attachments/assets/84802e8e-acf3-4f51-9470-edc483330cae" />

### Gamification
DoomGuard includes an XP system with 10 levels, 12 unlockable badges, and a daily clean-day streak counter. All progress is persisted locally using Chrome storage.
<img width="493" height="316" alt="image" src="https://github.com/user-attachments/assets/6a9fde1c-7fcc-46d6-8d1d-e56a3d4ab063" />

### Real-Time HUD
A minimizable SVG ring pill sits unobtrusively on tracked pages and expands into a full widget with breathe and focus buttons available inline, giving you immediate access to interventions without opening the popup.
<img width="320" height="345" alt="image" src="https://github.com/user-attachments/assets/bb7fef2e-0b0f-4d58-8857-07cf0f8bf45e" />

### Analytics
The popup provides a four-tab interface covering your weekly doom score chart, a 24-hour hourly heatmap, per-platform breakdown, and best and worst days at a glance.
<img width="497" height="767" alt="image" src="https://github.com/user-attachments/assets/4902f521-befb-4f11-8041-eb7060b94d5e" />

### Supported Platforms
DoomGuard tracks 12 platforms by default: Reddit, Twitter/X, Instagram, YouTube, Facebook, TikTok, LinkedIn, Pinterest, Twitch, Snapchat, Threads, and 9gag. You can add or remove any site from the Sites tab in the popup, with support for unlimited custom domains.
<img width="492" height="667" alt="image" src="https://github.com/user-attachments/assets/22cc880e-3c11-41fc-96a2-e2d76534b546" />

---

## Installation

DoomGuard is not yet on the Chrome Web Store. Install it manually in three steps.

1. Download and unzip `doomguard-v2.zip`
2. Open `chrome://extensions/` and enable **Developer Mode** (toggle in the top right)
3. Click **Load unpacked** and select the `extension/` folder

The extension will appear in your toolbar immediately.

**Browser compatibility:** Chrome, Microsoft Edge, and Brave.

**Requirements:** No API key or account needed. Runs fully offline.

---

## How It Works

DoomGuard's detection engine runs silently in the background as a content script. It assigns a real-time doom score based on scroll velocity, session length, tab-switching patterns, and time of day. When the score crosses your configured threshold, it triggers the intervention you have selected in Settings. Your doom score, XP, badges, and session history are all stored locally in Chrome's storage API and never leave your device.

---

## Roadmap

The following features are planned for v3.

- Per-site time limits with a hard block page when the limit is reached
- Challenge Mode — set a daily doom limit and unlock a special badge for beating it seven days in a row
- Animated number roll-up when the popup opens
- Weekly Chrome notification summary with your doom score for the week
- Whitelist mode — track only specific sites and allow everything else by default
- 30-day rolling historical trends chart

---

## Contributing

Contributions are welcome. Fork the repository, make your changes on a separate branch, and open a pull request with a clear description of what you have changed and why. Please test your changes in Chrome with Developer Mode enabled before submitting.

---

## License

MIT License. Free to use, modify, and distribute.

---

## Author

Built by [@DoesntMatterICare) — first-year B.Tech student at Vardhaman College of Engineering, Hyderabad.
