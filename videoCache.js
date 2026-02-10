(function () {
  'use strict';

  // ============================================
  // VIDEO CACHE - Centralized Video Preloading
  // ============================================

  const CONFIG = {
    // OPTIMIZED: More concurrent loads, less waiting
    maxConcurrentLoads: 6, // Was 3
    minBufferSeconds: 0.5, // Was 2
    maxCacheSize: 20,
    idleDelay: 500, // Was 2000 - start preloading sooner
    preloadAhead: 4,
    preloadBehind: 2,
    bufferCheckInterval: 30, // Was 50
    bufferTimeout: 1500, // Was 5000
    useBlobCache: false // NEW: Disable blob caching, use streaming
  };

  const state = {
    cache: new Map(),
    loading: new Set(),
    queue: [],
    idleTimer: null,
    isIdlePreloading: false,
    lastInteraction: Date.now()
  };

  // ============================================
  // CORE CACHING FUNCTIONS
  // ============================================

  function isCached(url) {
    return state.cache.has(url) && state.cache.get(url).status === 'ready';
  }

  function isLoading(url) {
    return state.loading.has(url);
  }

  function isQueued(url) {
    return state.queue.includes(url);
  }

  function getCachedUrl(url) {
    const entry = state.cache.get(url);
    return entry?.blobUrl || url;
  }

  function getCachedVideo(url) {
    const entry = state.cache.get(url);
    return entry?.video || null;
  }

  async function cacheVideo(url, priority = 'normal') {
    if (!url) return null;

    if (isCached(url)) {
      updateTimestamp(url);
      return state.cache.get(url);
    }

    if (isLoading(url)) {
      return waitForCache(url);
    }

    if (isQueued(url)) {
      return waitForCache(url);
    }

    if (state.loading.size >= CONFIG.maxConcurrentLoads) {
      if (priority === 'high') {
        state.queue.unshift(url);
      } else {
        state.queue.push(url);
      }
      return waitForCache(url);
    }

    return loadVideo(url);
  }

  async function loadVideo(url) {
    state.loading.add(url);

    state.cache.set(url, {
      blobUrl: null,
      video: null,
      status: 'loading',
      timestamp: Date.now()
    });

    // OPTIMIZED: Use streaming instead of blob download
    // This allows playback to start immediately while video downloads
    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    // Start loading immediately
    video.load();

    // Try to play to trigger buffering
    video.play().catch(() => {});

    const entry = {
      blobUrl: url, // Just use original URL for streaming
      video,
      status: 'ready',
      timestamp: Date.now()
    };

    state.cache.set(url, entry);
    state.loading.delete(url);

    processQueue();

    return entry;
  }

  function waitForCache(url) {
    return new Promise((resolve) => {
      const check = () => {
        if (isCached(url)) {
          resolve(state.cache.get(url));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  function processQueue() {
    while (state.queue.length > 0 && state.loading.size < CONFIG.maxConcurrentLoads) {
      const url = state.queue.shift();
      if (!isCached(url) && !isLoading(url)) {
        loadVideo(url);
      }
    }
  }

  function updateTimestamp(url) {
    const entry = state.cache.get(url);
    if (entry) {
      entry.timestamp = Date.now();
    }
  }

  function enforceCacheLimit() {
    if (state.cache.size <= CONFIG.maxCacheSize) return;

    const entries = Array.from(state.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, state.cache.size - CONFIG.maxCacheSize);

    toRemove.forEach(([url, entry]) => {
      if (entry.blobUrl && entry.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(entry.blobUrl);
      }

      if (entry.video) {
        entry.video.pause();
        entry.video.src = '';
        entry.video.load();
      }

      state.cache.delete(url);
    });
  }

  // ============================================
  // BUFFER READINESS
  // ============================================

  function hasEnoughBuffer(video, minSeconds = CONFIG.minBufferSeconds) {
    if (!video || !video.buffered || video.buffered.length === 0) {
      return false;
    }

    const currentTime = video.currentTime || 0;

    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);

      if (start <= currentTime && end >= currentTime + minSeconds) {
        return true;
      }
    }

    return false;
  }

  function waitForBuffer(url, minSeconds = CONFIG.minBufferSeconds) {
    return new Promise((resolve) => {
      const entry = state.cache.get(url);
      const video = entry?.video;

      if (!video) {
        resolve(false);
        return;
      }

      if (hasEnoughBuffer(video, minSeconds)) {
        resolve(true);
        return;
      }

      const startTime = Date.now();

      const check = () => {
        if (Date.now() - startTime > CONFIG.bufferTimeout) {
          resolve(false);
          return;
        }

        if (hasEnoughBuffer(video, minSeconds) || video.readyState >= 3) {
          resolve(true);
          return;
        }

        setTimeout(check, CONFIG.bufferCheckInterval);
      };

      check();
    });
  }

  async function ensureReady(url, minSeconds = CONFIG.minBufferSeconds) {
    if (!url) return false;

    if (!isCached(url)) {
      await cacheVideo(url, 'high');
    }

    return waitForBuffer(url, minSeconds);
  }

  // ============================================
  // BATCH PRELOADING
  // ============================================

  function preloadMultiple(urls, priority = 'normal') {
    const validUrls = urls.filter(url => url && !isCached(url) && !isLoading(url) && !isQueued(
      url));

    if (validUrls.length > 0) {
      validUrls.forEach(url => {
        cacheVideo(url, priority);
      });
    }
  }

  function preloadAround(urls, currentIndex, ahead = CONFIG.preloadAhead, behind = CONFIG
    .preloadBehind) {
    const toPreload = [];

    for (let i = 1; i <= ahead; i++) {
      const index = currentIndex + i;
      if (index < urls.length && urls[index]) {
        toPreload.push(urls[index]);
      }
    }

    for (let i = 1; i <= behind; i++) {
      const index = currentIndex - i;
      if (index >= 0 && urls[index]) {
        toPreload.push(urls[index]);
      }
    }

    preloadMultiple(toPreload);
  }

  // ============================================
  // IDLE PRELOADING
  // ============================================

  function markInteraction() {
    state.lastInteraction = Date.now();
    state.isIdlePreloading = false;

    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
    }

    state.idleTimer = setTimeout(startIdlePreload, CONFIG.idleDelay);
  }

  function startIdlePreload() {
    if (state.isIdlePreloading) return;
    state.isIdlePreloading = true;

    if (!window.projectVideoRegistry) return;

    const allUrls = Array.from(window.projectVideoRegistry.values()).map(v => v.url);
    const uncached = allUrls.filter(url => !isCached(url) && !isLoading(url));

    if (uncached.length === 0) return;

    uncached.forEach((url, index) => {
      setTimeout(() => {
        if (state.isIdlePreloading && !isCached(url)) {
          cacheVideo(url, 'normal');
        }
      }, index * 500);
    });
  }

  function setupIdleDetection() {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

    events.forEach(event => {
      document.addEventListener(event, markInteraction, { passive: true });
    });

    state.idleTimer = setTimeout(startIdlePreload, CONFIG.idleDelay);
  }

  // ============================================
  // STATISTICS
  // ============================================

  function getStats() {
    const entries = Array.from(state.cache.values());
    const registrySize = window.projectVideoRegistry ? window.projectVideoRegistry.size : 0;
    const cachedFromRegistry = window.projectVideoRegistry ?
      Array.from(window.projectVideoRegistry.values()).filter(v => isCached(v.url)).length :
      0;

    return {
      cached: entries.filter(e => e.status === 'ready').length,
      loading: state.loading.size,
      queued: state.queue.length,
      total: state.cache.size,
      isIdlePreloading: state.isIdlePreloading,
      totalSizeBytes: entries.reduce((sum, e) => sum + (e.size || 0), 0),
      totalSizeMB: (entries.reduce((sum, e) => sum + (e.size || 0), 0) / (1024 * 1024)).toFixed(
        1),
      registryTotal: registrySize,
      registryCached: cachedFromRegistry,
      registryPercent: registrySize > 0 ? Math.round(cachedFromRegistry / registrySize * 100) : 0
    };
  }

  // ============================================
  // CLEANUP
  // ============================================

  function clearCache() {
    state.cache.forEach((entry, url) => {
      if (entry.blobUrl && entry.blobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(entry.blobUrl);
      }
      if (entry.video) {
        entry.video.pause();
        entry.video.src = '';
      }
    });

    state.cache.clear();
    state.loading.clear();
    state.queue = [];
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function init() {
    setupIdleDetection();

    window.videoCache = {
      // Core
      cacheVideo,
      getCachedUrl,
      getCachedVideo,
      isCached,
      isLoading,
      isQueued,

      // Buffer
      hasEnoughBuffer,
      waitForBuffer,
      ensureReady,

      // Batch
      preloadMultiple,
      preloadAround,

      // Idle
      markInteraction,
      startIdlePreload,

      // Utils
      getStats,
      clearCache,

      // State (for debugging)
      state,
      CONFIG
    };
  }

  init();

})();
