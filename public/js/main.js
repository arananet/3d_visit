/**
 * main.js — Application bootstrap
 */

import { SceneManager } from './scene-manager.js';
import { StoryController } from './story-controller.js';
import { WorldLabsClient } from './worldlabs.js';
import { showError, setProgress, hideLoading } from './ui.js';

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const loadingMessage = document.getElementById('loading-message');

async function boot() {
  try {
    setProgress(10, 'Setting up 3D renderer…');
    const canvas = document.getElementById('main-canvas');
    const sceneManager = new SceneManager(canvas);

    setProgress(30, 'Queuing AI world generation…');
    const worldLabsClient = new WorldLabsClient();
    // Fire-and-forget: worlds generate in background while user views earlier scenes
    worldLabsClient.queueAll();

    setProgress(60, 'Loading scene config…');
    // Load Google 3D Tiles config eagerly so it's ready for scene 0
    await sceneManager.preloadMapsConfig();

    setProgress(80, 'Building story…');
    const story = new StoryController(sceneManager, worldLabsClient);

    setProgress(95, 'Starting experience…');
    sceneManager.start();

    hideLoading();

    // Navigation bindings
    btnPrev.addEventListener('click', () => story.prev());
    btnNext.addEventListener('click', () => story.next());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') story.next();
      if (e.key === 'ArrowLeft') story.prev();
    });

    let touchStartX = 0;
    window.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) dx < 0 ? story.next() : story.prev();
    }, { passive: true });

    story.goTo(0);

  } catch (err) {
    console.error('[main] Boot error:', err);
    showError('Failed to initialise. Please refresh.');
    loadingMessage.textContent = `Error: ${err.message}`;
  }
}

boot();
