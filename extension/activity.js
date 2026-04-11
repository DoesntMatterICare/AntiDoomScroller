// DoomGuard Activity Worker
// Handles scroll counting, velocity detection, and click counting entirely
// off the main thread. The content script posts raw events here; this worker
// accumulates them and returns batched totals on demand (FLUSH).
'use strict';

const SCROLL_DISTANCE = 300;   // px of scrollY delta = 1 meaningful scroll
let lastScrollY     = null;
let scrollCount     = 0;
let velocityHits    = 0;
let clickCount      = 0;
let pageLoads       = 0;
let lastVelocityTs  = 0;

// Ring buffer of last 10 raw scroll timestamps for velocity window detection
const scrollTimes = [];

self.onmessage = ({ data }) => {
  switch (data.type) {

    case 'SCROLL': {
      const { y, time } = data;

      // Distance-based count
      if (lastScrollY === null) {
        lastScrollY = y;
      } else if (Math.abs(y - lastScrollY) >= SCROLL_DISTANCE) {
        scrollCount++;
        lastScrollY = y;
      }

      // Velocity detection: 10 events within 3 seconds = rapid scrolling
      scrollTimes.push(time);
      if (scrollTimes.length > 10) scrollTimes.shift();
      if (
        scrollTimes.length === 10 &&
        scrollTimes[9] - scrollTimes[0] < 3000 &&
        time - lastVelocityTs >= 1000   // max one hit/sec
      ) {
        velocityHits++;
        lastVelocityTs = time;
      }
      break;
    }

    case 'CLICK':
      clickCount++;
      break;

    case 'PAGE_LOAD':
      pageLoads++;
      break;

    case 'FLUSH':
      // Return accumulated counts and reset
      self.postMessage({ type: 'COUNTS', scrollCount, velocityHits, clickCount, pageLoads });
      scrollCount = 0; velocityHits = 0; clickCount = 0; pageLoads = 0;
      break;
  }
};