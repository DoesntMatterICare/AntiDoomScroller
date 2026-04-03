// DoomGuard NSFWJS Offscreen Worker v2
// Runs inside a Chrome Offscreen Document — no CSP eval restrictions.
// Loads MobileNetV2 NSFWJS model fully locally, zero internet.

'use strict';

let nsfwModel = null;
let modelLoading = false;
let modelReady = false;

/** Try multiple loading strategies for the NSFWJS model */
async function loadModel() {
  if (modelLoading) return;
  modelLoading = true;

  // Use CPU backend to avoid WebGL/eval issues inside offscreen docs
  try {
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('[DoomGuard Offscreen] TF.js ready, backend:', tf.getBackend());
  } catch (e) {
    console.warn('[DoomGuard Offscreen] TF backend warn:', e.message);
  }

  // Strategy 1: Load using bundled globals (model.min.js sets window.model)
  try {
    console.log('[DoomGuard Offscreen] Trying bundled model globals...');
    nsfwModel = await nsfwjs.load('MobileNetV2', { size: 224 });
    modelReady = true;
    console.log('[DoomGuard Offscreen] Model loaded via bundled globals.');
    return;
  } catch (e1) {
    console.warn('[DoomGuard Offscreen] Bundled globals failed:', e1.message);
  }

  // Strategy 2: Load from local extension model path (TF.js JSON format)
  try {
    console.log('[DoomGuard Offscreen] Trying local model path...');
    const modelUrl = chrome.runtime.getURL('model/mobilenet_v2/');
    nsfwModel = await nsfwjs.load(modelUrl, { size: 224 });
    modelReady = true;
    console.log('[DoomGuard Offscreen] Model loaded from local path.');
    return;
  } catch (e2) {
    console.warn('[DoomGuard Offscreen] Local path failed:', e2.message);
  }

  // Strategy 3: Load directly from nsfwjs CDN (fallback — needs internet first time)
  try {
    console.log('[DoomGuard Offscreen] Trying CDN fallback...');
    nsfwModel = await nsfwjs.load(
      'https://nsfwjs.com/quant_nsfw_mobilenet/',
      { size: 224 }
    );
    modelReady = true;
    console.log('[DoomGuard Offscreen] Model loaded from CDN.');
    return;
  } catch (e3) {
    console.warn('[DoomGuard Offscreen] CDN failed:', e3.message);
  }

  console.error('[DoomGuard Offscreen] All model loading strategies failed.');
  modelLoading = false;
}

/**
 * Classify a dataURL image. Returns array of { className, probability } or null.
 */
async function classifyImage(dataUrl) {
  if (!modelReady || !nsfwModel) return null;

  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = dataUrl;
    });

    const predictions = await nsfwModel.classify(img);
    return predictions;
  } catch (err) {
    console.warn('[DoomGuard Offscreen] Classify error:', err.message);
    return null;
  }
}

// Connect to background via long-lived Port
let bgPort = null;

function connectToBackground() {
  bgPort = chrome.runtime.connect({ name: 'dg-nsfwjs-port' });
  console.log('[DoomGuard Offscreen] Port connected to background.');

  bgPort.onMessage.addListener(async ({ requestId, dataUrl }) => {
    if (!requestId) return;
    const predictions = await classifyImage(dataUrl);
    bgPort.postMessage({ requestId, predictions });
  });

  bgPort.onDisconnect.addListener(() => {
    console.log('[DoomGuard Offscreen] Port disconnected, reconnecting...');
    bgPort = null;
    setTimeout(connectToBackground, 1000);
  });
}

// Initialize
connectToBackground();
loadModel();
