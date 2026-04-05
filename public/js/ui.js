/**
 * ui.js — Shared UI utilities (no imports from other app modules)
 *
 * Extracted here to break the circular dependency between main.js and
 * story-controller.js.
 */

const errorToast = document.getElementById('error-toast');
const loadingMessage = document.getElementById('loading-message');
const progressFill = document.getElementById('progress-fill');
const loadingScreen = document.getElementById('loading-screen');

let _toastTimer = null;

/** Show a transient error toast for 5 seconds. */
export function showError(msg) {
  console.error('[tour]', msg);
  errorToast.textContent = msg;
  errorToast.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => errorToast.classList.remove('visible'), 5000);
}

/** Update the loading screen progress bar (0–100) and optional message. */
export function setProgress(pct, message) {
  progressFill.style.width = `${Math.min(100, pct)}%`;
  if (message) loadingMessage.textContent = message;
}

/** Fade out and hide the loading screen. */
export function hideLoading() {
  loadingScreen.classList.add('hidden');
  setTimeout(() => { loadingScreen.style.display = 'none'; }, 900);
}
