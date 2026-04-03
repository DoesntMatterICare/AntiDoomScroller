// DoomGuard NSFWJS Offscreen Worker
// Runs in a hidden offscreen document — no eval restrictions, no internet

'use strict';

let nsfwModel = null;
let modelLoading = false;
let modelLoadPromise = null;

/** Load model once, cache it */
async function getModel() {
  if (nsfwModel) return nsfwModel;
  if (modelLoading) return modelLoadPromise;

  modelLoading = true;
  modelLoadPromise = (async () => {
    try {
      console.log('[DoomGuard Offscreen] Loading NSFWJS model...');
      // Use CPU backend to avoid WebGL/eval issues
      await tf.setBackend('cpu');
      await tf.ready();

      // Load bundled MobileNetV2 model (window.model + window.group1_shard1of1 already set by scripts)
      nsfwModel = await nsfwjs.load('MobileNetV2', { size: 224 });
      console.log('[DoomGuard Offscreen] Model ready.');
      return nsfwModel;
    } catch (err) {
      console.error('[DoomGuard Offscreen] Model load error:', err);
      modelLoading = false;
      nsfwModel = null;
      throw err;
    }
  })();

  return modelLoadPromise;
}

/**
 * Classify a dataURL image.
 * Returns array of { className, probability } or null on error.
 */
async function classifyDataUrl(dataUrl) {
  try {
    const model = await getModel();

    // Create a temporary image element in the offscreen document
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });

    const predictions = await model.classify(img);
    img.remove();
    return predictions;
  } catch (err) {
    console.warn('[DoomGuard Offscreen] Classify error:', err.message);
    return null;
  }
}

// Listen for classification requests from background.js via port
const port = chrome.runtime.connect({ name: 'dg-nsfwjs-port' });

port.onMessage.addListener(async ({ requestId, dataUrl }) => {
  if (!requestId || !dataUrl) return;

  const predictions = await classifyDataUrl(dataUrl);
  port.postMessage({ requestId, predictions });
});

// Pre-warm the model on load (so first image classification is fast)
setTimeout(() => {
  getModel().catch(() => {});
}, 500);

console.log('[DoomGuard Offscreen] Worker ready.');
