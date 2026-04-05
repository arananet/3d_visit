/**
 * main.js — Application bootstrap
 *
 * Initialises all subsystems and starts the story.
 */

import { SceneManager } from './scene-manager.js';
import { StoryController } from './story-controller.js';
import { WorldLabsClient } from './worldlabs.js';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen');
const loadingMessage = document.getElementById('loading-message');
const progressFill = document.getElementById('progress-fill');
const errorToast = document.getElementById('error-toast');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');

// ── Error helper ──────────────────────────────────────────────────────────────
let toastTimer = null;
export function showError(msg) {
  errorToast.textContent = msg;
  errorToast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => errorToast.classList.remove('visible'), 5000);
}

// ── Loading progress ──────────────────────────────────────────────────────────
function setProgress(pct, message) {
  progressFill.style.width = `${pct}%`;
  if (message) loadingMessage.textContent = message;
}

function hideLoading() {
  loadingScreen.classList.add('hidden');
  setTimeout(() => { loadingScreen.style.display = 'none'; }, 900);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    setProgress(10, 'Setting up 3D renderer…');
    const canvas = document.getElementById('main-canvas');
    const sceneManager = new SceneManager(canvas);

    setProgress(25, 'Loading scene config…');

    // Pre-kick World Labs generation in the background so worlds are ready
    // when the user reaches those story points.
    setProgress(35, 'Queuing AI world generation…');
    const worldLabsClient = new WorldLabsClient();
    await worldLabsClient.queueAll();

    setProgress(55, 'Fetching map configuration…');

    setProgress(70, 'Building story…');
    const story = new StoryController(sceneManager, worldLabsClient);

    setProgress(90, 'Starting experience…');
    await sceneManager.start();

    setProgress(100, 'Ready');
    hideLoading();

    // Wire up navigation buttons
    btnPrev.addEventListener('click', () => story.prev());
    btnNext.addEventListener('click', () => story.next());

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') story.next();
      if (e.key === 'ArrowLeft') story.prev();
    });

    // Touch swipe
    let touchStartX = 0;
    window.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    window.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) dx < 0 ? story.next() : story.prev();
    }, { passive: true });

    // Kick off the first scene
    story.goTo(0);

  } catch (err) {
    console.error('[main] Boot error:', err);
    showError('Failed to initialise the experience. Please refresh the page.');
    loadingMessage.textContent = `Error: ${err.message}`;
  }
}

boot();
