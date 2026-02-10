(function () {
  'use strict';

  const CONFIG = {
    projectBasePath: '/projects',
    controlsTimeout: 1700,
    autoplayWithSound: true,
    unmuteDelay: 50, // Was 100 - faster unmute
    preload: {
      ahead: 3, // Was 2 - preload more
      behind: 1,
      backgroundDelay: 100 // Was 500 - start much sooner
    }
  };

  const state = {
    isPlaying: true,
    isMuted: true,
    isFullscreen: false,
    controlsVisible: false,
    controlsTimer: null,
    initialized: false,
    hasUserInteracted: false,
    prefetchedPages: new Set()
  };

  let elements = {
    video: null,
    playButtons: null,
    pauseButtons: null,
    muteButton: null,
    fullscreenButton: null,
    // Mobile controls
    mobileMuteIcon: null,
    mobileSoundIcon: null,
    mobileFullscreenIcon: null,
    mobileMinimiseIcon: null,
    // Other elements
    timeline: null,
    timelineProgress: null,
    timelineHandle: null,
    prevButton: null,
    nextButton: null,
    projectSlugs: null,
    heroWrap: null,
    controls: null
  };

  function requeryElements() {
    elements.video = document.querySelector('[data-project="master"]');
    elements.playButtons = document.querySelectorAll('[data-control="play"]');
    elements.pauseButtons = document.querySelectorAll('[data-control="pause"]');
    elements.muteButton = document.querySelector('[data-control="mute"]');
    elements.fullscreenButton = document.querySelector('[data-control="fullscreen"]');
    // Mobile controls
    elements.mobileMuteIcon = document.querySelector('[data-control="mobile-mute"]');
    elements.mobileSoundIcon = document.querySelector('[data-control="mobile-sound"]');
    elements.mobileFullscreenIcon = document.querySelector('[data-control="mobile-fullscreen"]');
    elements.mobileMinimiseIcon = document.querySelector('[data-control="mobile-minimse"]');
    // Other elements
    elements.timeline = document.querySelector('[data-control="timeline"]');
    elements.timelineProgress = document.querySelector('[data-timeline="progress"]');
    elements.timelineHandle = document.querySelector('[data-timeline="handle"]');
    elements.prevButton = document.querySelector('[data-control="previous"]');
    elements.nextButton = document.querySelector('[data-control="next"]');
    elements.projectSlugs = document.querySelectorAll('[data-project-slug]');
    elements.heroWrap = document.querySelector('.project_hero_wrap');
    elements.controls = document.querySelector('.project_hero_controls');
  }

  function getCurrentSlug() {
    const path = window.location.pathname;
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1];
  }

  function getProjectList() {
    return Array.from(elements.projectSlugs).map(el => el.dataset.projectSlug);
  }

  function prefetchPage(href) {
    if (!href) return;
    if (state.prefetchedPages.has(href)) return;
    if (typeof barba === 'undefined' || !barba.cache) return;

    state.prefetchedPages.add(href);
    barba.prefetch(href);
  }

  function setupVideoSource() {
    if (!elements.video) return false;

    if (!elements.video.paused && elements.video.src) {
      return true;
    }

    const slug = getCurrentSlug();

    elements.video.crossOrigin = 'anonymous';

    if (elements.video.src && elements.video.src !== window.location.href) {
      return true;
    }

    // ENHANCED: Try to use cached blob URL first
    if (window.projectVideoRegistry && window.projectVideoRegistry.has(slug)) {
      const videoInfo = window.projectVideoRegistry.get(slug);
      let url = videoInfo.url;

      // Check if videoCache has a blob URL
      if (window.videoCache && window.videoCache.isCached(url)) {
        url = window.videoCache.getCachedUrl(url);
      }

      elements.video.src = url;
      elements.video.load();
      return true;
    }

    const fallbackSrc = elements.video.dataset.videoSrc;
    if (fallbackSrc) {
      // Check if videoCache has a blob URL
      let url = fallbackSrc;
      if (window.videoCache && window.videoCache.isCached(url)) {
        url = window.videoCache.getCachedUrl(url);
      }

      elements.video.src = url;
      elements.video.load();
      return true;
    }

    return false;
  }

  function setupVideoRatio() {
    if (!elements.video) return;

    const ratio = (elements.video.dataset.projectRatio || 'cover').toLowerCase();
    elements.video.style.setProperty('object-fit', ratio, 'important');
  }

  // Sync state with actual video element state
  function syncStateWithVideo() {
    if (!elements.video) return;

    // Sync play/pause state
    state.isPlaying = !elements.video.paused;
    updatePlayPauseUI();

    // Sync mute state
    state.isMuted = elements.video.muted;
    updateMuteUI();

    // Sync fullscreen state
    state.isFullscreen = !!document.fullscreenElement || !!document.webkitFullscreenElement;
    updateFullscreenUI();
  }

  // Setup video event listeners to keep state in sync
  function setupVideoEventListeners() {
    if (!elements.video) return;

    elements.video.addEventListener('play', () => {
      state.isPlaying = true;
      updatePlayPauseUI();
    });

    elements.video.addEventListener('pause', () => {
      state.isPlaying = false;
      updatePlayPauseUI();
    });

    elements.video.addEventListener('volumechange', () => {
      state.isMuted = elements.video.muted;
      updateMuteUI();
    });
  }

  async function attemptAutoplayWithSound() {
    if (!elements.video || !CONFIG.autoplayWithSound) {
      syncStateWithVideo();
      return;
    }

    // If video is already playing, just sync the state
    if (!elements.video.paused) {
      state.isPlaying = true;
      state.isMuted = elements.video.muted;
      updatePlayPauseUI();
      updateMuteUI();
      return;
    }

    // Try to autoplay muted first (most browsers allow this)
    elements.video.muted = true;

    try {
      await elements.video.play();

      state.isPlaying = true;
      updatePlayPauseUI();

      // Try to unmute after a short delay
      setTimeout(async () => {
        try {
          elements.video.muted = false;
          state.isMuted = false;
          updateMuteUI();
        } catch (unmuteError) {
          elements.video.muted = true;
          state.isMuted = true;
          updateMuteUI();
        }
      }, CONFIG.unmuteDelay);

    } catch (playError) {
      // Autoplay failed - video remains paused
      state.isPlaying = false;
      state.isMuted = true;
      updatePlayPauseUI();
      updateMuteUI();
    }
  }

  function setupUserInteractionTracking() {
    if (state.hasUserInteracted) return;

    const markInteraction = () => {
      state.hasUserInteracted = true;

      document.removeEventListener('click', markInteraction);
      document.removeEventListener('touchstart', markInteraction);
      document.removeEventListener('keydown', markInteraction);
    };

    document.addEventListener('click', markInteraction, { once: true });
    document.addEventListener('touchstart', markInteraction, { once: true });
    document.addEventListener('keydown', markInteraction, { once: true });
  }

  // Handle window resize to update mobile icons visibility
  function setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateMuteUI();
        updateFullscreenUI();
      }, 100);
    });
  }

  function showControls() {
    if (!state.controlsVisible) {
      state.controlsVisible = true;
      if (elements.heroWrap) {
        elements.heroWrap.classList.remove('is-controls-hidden');
      }
      if (elements.controls) {
        elements.controls.style.opacity = '1';
        elements.controls.style.visibility = 'visible';
      }
    }
    resetControlsTimer();
  }

  function hideControls() {
    if (state.controlsVisible) {
      state.controlsVisible = false;
      if (elements.heroWrap) {
        elements.heroWrap.classList.add('is-controls-hidden');
      }
      if (elements.controls) {
        elements.controls.style.opacity = '0';
        elements.controls.style.visibility = 'hidden';
      }
    }
  }

  function resetControlsTimer() {
    if (state.controlsTimer) {
      clearTimeout(state.controlsTimer);
    }

    state.controlsTimer = setTimeout(() => {
      if (state.isPlaying) {
        hideControls();
      }
    }, CONFIG.controlsTimeout);
  }

  function setupControlsVisibility() {
    if (!elements.heroWrap) return;

    elements.heroWrap.addEventListener('mousemove', showControls);
    elements.heroWrap.addEventListener('click', showControls);
    elements.heroWrap.addEventListener('touchstart', showControls);

    if (elements.controls) {
      elements.controls.addEventListener('mouseenter', () => {
        if (state.controlsTimer) {
          clearTimeout(state.controlsTimer);
        }
      });

      elements.controls.addEventListener('mouseleave', () => {
        resetControlsTimer();
      });
    }
  }

  function updatePlayPauseUI() {
    elements.playButtons.forEach(btn => {
      btn.style.display = state.isPlaying ? 'none' : 'block';
    });

    elements.pauseButtons.forEach(btn => {
      btn.style.display = state.isPlaying ? 'block' : 'none';
    });
  }

  function play() {
    if (!elements.video) return;
    elements.video.play().catch(() => {});
    state.isPlaying = true;
    updatePlayPauseUI();
    resetControlsTimer();
  }

  function pause() {
    if (!elements.video) return;
    elements.video.pause();
    state.isPlaying = false;
    updatePlayPauseUI();
    showControls();

    if (state.controlsTimer) {
      clearTimeout(state.controlsTimer);
    }
  }

  function togglePlayPause() {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }

  function setupPlayPause() {
    elements.playButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        play();
      });
    });

    elements.pauseButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        pause();
      });
    });

    if (elements.heroWrap) {
      elements.heroWrap.addEventListener('click', (e) => {
        const clickedElement = e.target;
        const isActualControl = clickedElement.closest(
          'a, button, [data-control], [data-popup-toggle], [data-nav-toggle], [data-timeline], .timeline_progress, .timeline_handle'
        );

        if (isActualControl) return;

        togglePlayPause();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        togglePlayPause();
      }
    });

    updatePlayPauseUI();
  }

  function isMobileOrTablet() {
    return window.innerWidth <= 991;
  }

  function updateMuteUI() {
    // Desktop text button
    if (elements.muteButton) {
      elements.muteButton.textContent = state.isMuted ? 'Unmute' : 'Mute';
    }
    // Mobile icons - only show on tablet and below
    if (isMobileOrTablet()) {
      // Show mute icon (X through speaker) when MUTED
      if (elements.mobileMuteIcon) {
        elements.mobileMuteIcon.style.display = state.isMuted ? 'block' : 'none';
      }
      // Show sound icon (speaker with waves) when sound is ON
      if (elements.mobileSoundIcon) {
        elements.mobileSoundIcon.style.display = state.isMuted ? 'none' : 'block';
      }
    } else {
      // Hide both on desktop
      if (elements.mobileMuteIcon) {
        elements.mobileMuteIcon.style.display = 'none';
      }
      if (elements.mobileSoundIcon) {
        elements.mobileSoundIcon.style.display = 'none';
      }
    }
  }

  function mute() {
    if (!elements.video) return;
    elements.video.muted = true;
    state.isMuted = true;
    updateMuteUI();
  }

  function unmute() {
    if (!elements.video) return;
    elements.video.muted = false;
    state.isMuted = false;
    updateMuteUI();
  }

  function toggleMute() {
    if (state.isMuted) {
      unmute();
    } else {
      mute();
    }
  }

  function setupMute() {
    // Desktop text button
    if (elements.muteButton) {
      elements.muteButton.addEventListener('click', (e) => {
        e.preventDefault();
        toggleMute();
      });
    }

    // Mobile mute icon (shows when MUTED - click to unmute)
    if (elements.mobileMuteIcon) {
      // Ensure SVG children don't block clicks
      elements.mobileMuteIcon.style.pointerEvents = 'auto';
      elements.mobileMuteIcon.style.cursor = 'pointer';

      elements.mobileMuteIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        unmute();
      });
    }

    // Mobile sound icon (shows when sound is ON - click to mute)
    if (elements.mobileSoundIcon) {
      // Ensure SVG children don't block clicks
      elements.mobileSoundIcon.style.pointerEvents = 'auto';
      elements.mobileSoundIcon.style.cursor = 'pointer';

      elements.mobileSoundIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mute();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && e.target === document.body) {
        e.preventDefault();
        toggleMute();
      }
    });

    updateMuteUI();
  }

  function updateTimeline() {
    if (!elements.video || !elements.timelineProgress) return;

    const percent = (elements.video.currentTime / elements.video.duration) * 100;

    elements.timelineProgress.style.width = `${percent}%`;

    if (elements.timelineHandle) {
      elements.timelineHandle.style.left = `${percent}%`;
    }
  }

  function seekTo(e) {
    if (!elements.timeline || !elements.video) return;

    const rect = elements.timeline.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * elements.video.duration;

    elements.video.currentTime = time;
    updateTimeline();
  }

  function setupTimeline() {
    if (!elements.timeline) return;

    elements.timeline.addEventListener('click', seekTo);

    let isDragging = false;

    elements.timeline.addEventListener('mousedown', (e) => {
      isDragging = true;
      seekTo(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        seekTo(e);
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    if (elements.video) {
      elements.video.addEventListener('timeupdate', updateTimeline);
    }
  }

  function updateFullscreenUI() {
    // Desktop text button
    if (elements.fullscreenButton) {
      elements.fullscreenButton.textContent = state.isFullscreen ? 'Exit' : 'Fullscreen';
    }
    // Mobile icons - only show on tablet and below
    if (isMobileOrTablet()) {
      // Show fullscreen icon when NOT in fullscreen
      if (elements.mobileFullscreenIcon) {
        elements.mobileFullscreenIcon.style.display = state.isFullscreen ? 'none' : 'block';
      }
      // Show minimise icon when IN fullscreen
      if (elements.mobileMinimiseIcon) {
        elements.mobileMinimiseIcon.style.display = state.isFullscreen ? 'block' : 'none';
      }
    } else {
      // Hide both on desktop
      if (elements.mobileFullscreenIcon) {
        elements.mobileFullscreenIcon.style.display = 'none';
      }
      if (elements.mobileMinimiseIcon) {
        elements.mobileMinimiseIcon.style.display = 'none';
      }
    }
  }

  function enterFullscreen() {
    const el = elements.heroWrap || document.documentElement;

    // Try standard Fullscreen API first (works on Android, desktop)
    if (el.requestFullscreen) {
      el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
    // iOS Safari fallback - use video element's native fullscreen
    else if (elements.video && elements.video.webkitEnterFullscreen) {
      elements.video.webkitEnterFullscreen();
    }
    // Another iOS fallback
    else if (elements.video && elements.video.webkitRequestFullscreen) {
      elements.video.webkitRequestFullscreen();
    }
  }

  function exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    // iOS Safari fallback
    else if (elements.video && elements.video.webkitExitFullscreen) {
      elements.video.webkitExitFullscreen();
    }
  }

  function toggleFullscreen() {
    if (state.isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  function setupFullscreen() {
    // Desktop text button
    if (elements.fullscreenButton) {
      elements.fullscreenButton.addEventListener('click', (e) => {
        e.preventDefault();
        toggleFullscreen();
      });
    }

    // Mobile fullscreen icon (shows when NOT fullscreen - click to enter)
    if (elements.mobileFullscreenIcon) {
      // Ensure SVG children don't block clicks
      elements.mobileFullscreenIcon.style.pointerEvents = 'auto';
      elements.mobileFullscreenIcon.style.cursor = 'pointer';

      elements.mobileFullscreenIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterFullscreen();
      });
    }

    // Mobile minimise icon (shows when IN fullscreen - click to exit)
    if (elements.mobileMinimiseIcon) {
      // Ensure SVG children don't block clicks
      elements.mobileMinimiseIcon.style.pointerEvents = 'auto';
      elements.mobileMinimiseIcon.style.cursor = 'pointer';

      elements.mobileMinimiseIcon.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        exitFullscreen();
      });
    }

    document.addEventListener('fullscreenchange', () => {
      state.isFullscreen = !!document.fullscreenElement;
      updateFullscreenUI();
    });

    document.addEventListener('webkitfullscreenchange', () => {
      state.isFullscreen = !!document.webkitFullscreenElement;
      updateFullscreenUI();
    });

    // iOS Safari video fullscreen events
    if (elements.video) {
      elements.video.addEventListener('webkitbeginfullscreen', () => {
        state.isFullscreen = true;
        updateFullscreenUI();
      });

      elements.video.addEventListener('webkitendfullscreen', () => {
        state.isFullscreen = false;
        updateFullscreenUI();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && e.target === document.body) {
        e.preventDefault();
        toggleFullscreen();
      }
    });

    updateFullscreenUI();
  }

  function setupNavigation() {
    const prevButton = document.querySelector('[data-control="previous"]');
    const nextButton = document.querySelector('[data-control="next"]');
    const projectSlugs = document.querySelectorAll('[data-project-slug]');

    const projects = Array.from(projectSlugs).map(el => el.dataset.projectSlug);
    const currentSlug = getCurrentSlug();
    const currentIndex = projects.indexOf(currentSlug);

    if (projects.length === 0 || currentIndex === -1) {
      if (prevButton) prevButton.style.visibility = 'hidden';
      if (nextButton) nextButton.style.visibility = 'hidden';
      return;
    }

    // Previous button - loops to last project if at beginning
    if (prevButton) {
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : projects.length - 1;
      const prevSlug = projects[prevIndex];
      const prevUrl = `${CONFIG.projectBasePath}/${prevSlug}`;
      prevButton.setAttribute('href', prevUrl);
      prevButton.style.visibility = 'visible';
    }

    // Next button - loops to first project if at end
    if (nextButton) {
      const nextIndex = currentIndex < projects.length - 1 ? currentIndex + 1 : 0;
      const nextSlug = projects[nextIndex];
      const nextUrl = `${CONFIG.projectBasePath}/${nextSlug}`;
      nextButton.setAttribute('href', nextUrl);
      nextButton.style.visibility = 'visible';
    }
  }

  // ============================================
  // ENHANCED: Preload master video using videoCache
  // ============================================

  function preloadMasterVideo(slug) {
    if (!slug) return;

    if (window.projectVideoRegistry && window.projectVideoRegistry.has(slug)) {
      const videoInfo = window.projectVideoRegistry.get(slug);
      const url = videoInfo.url;

      // Use new videoCache if available
      if (window.videoCache) {
        window.videoCache.cacheVideo(url);
        return;
      }

      // Fallback to old system
      if (window.masterVideoCache && window.masterVideoCache.has(url)) {
        return;
      }

      const video = document.createElement('video');
      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.crossOrigin = 'anonymous';

      if (window.masterVideoCache) {
        window.masterVideoCache.set(url, video);
      }

      video.load();
      video.play().catch(() => {});
    }
  }

  // ============================================
  // ENHANCED: Preload adjacent projects on init
  // ============================================

  function preloadAdjacentProjects() {
    const projectSlugs = document.querySelectorAll('[data-project-slug]');
    const projects = Array.from(projectSlugs).map(el => el.dataset.projectSlug);
    const currentSlug = getCurrentSlug();
    const currentIndex = projects.indexOf(currentSlug);

    if (currentIndex === -1 || projects.length === 0) return;

    // Collect URLs and pages to preload
    const urlsToPreload = [];
    const pagesToPrefetch = [];

    // Preload projects AHEAD (with wrapping)
    for (let i = 1; i <= CONFIG.preload.ahead; i++) {
      const index = (currentIndex + i) % projects.length;
      const slug = projects[index];
      const url = `${CONFIG.projectBasePath}/${slug}`;

      pagesToPrefetch.push(url);

      if (window.projectVideoRegistry && window.projectVideoRegistry.has(slug)) {
        urlsToPreload.push(window.projectVideoRegistry.get(slug).url);
      }
    }

    // Preload projects BEHIND (with wrapping)
    for (let i = 1; i <= CONFIG.preload.behind; i++) {
      const index = (currentIndex - i + projects.length) % projects.length;
      const slug = projects[index];
      const url = `${CONFIG.projectBasePath}/${slug}`;

      pagesToPrefetch.push(url);

      if (window.projectVideoRegistry && window.projectVideoRegistry.has(slug)) {
        urlsToPreload.push(window.projectVideoRegistry.get(slug).url);
      }
    }

    // Prefetch pages
    pagesToPrefetch.forEach(href => prefetchPage(href));

    // Preload videos
    if (window.videoCache) {
      window.videoCache.preloadMultiple(urlsToPreload);
    } else {
      // Fallback: preload using old method with wrapping
      for (let i = 1; i <= CONFIG.preload.ahead; i++) {
        const index = (currentIndex + i) % projects.length;
        preloadMasterVideo(projects[index]);
      }
      for (let i = 1; i <= CONFIG.preload.behind; i++) {
        const index = (currentIndex - i + projects.length) % projects.length;
        preloadMasterVideo(projects[index]);
      }
    }
  }

  // ============================================
  // ENHANCED: Setup hover preloading for nav buttons
  // ============================================

  function setupNavHoverPrefetch() {
    const prevButton = document.querySelector('[data-control="previous"]');
    const nextButton = document.querySelector('[data-control="next"]');
    const projectSlugs = document.querySelectorAll('[data-project-slug]');

    const projects = Array.from(projectSlugs).map(el => el.dataset.projectSlug);
    const currentSlug = getCurrentSlug();
    const currentIndex = projects.indexOf(currentSlug);

    if (projects.length === 0 || currentIndex === -1) return;

    // Previous button hover - preload 2 projects back (with wrapping)
    if (prevButton) {
      prevButton.addEventListener('mouseenter', () => {
        for (let i = 1; i <= 2; i++) {
          // Wrap around using modulo
          const index = (currentIndex - i + projects.length) % projects.length;
          const slug = projects[index];

          // Prefetch page
          const pageUrl = `${CONFIG.projectBasePath}/${slug}`;
          prefetchPage(pageUrl);

          // Preload video
          preloadMasterVideo(slug);
        }
      });
    }

    // Next button hover - preload 2 projects ahead (with wrapping)
    if (nextButton) {
      nextButton.addEventListener('mouseenter', () => {
        for (let i = 1; i <= 2; i++) {
          // Wrap around using modulo
          const index = (currentIndex + i) % projects.length;
          const slug = projects[index];

          // Prefetch page
          const pageUrl = `${CONFIG.projectBasePath}/${slug}`;
          prefetchPage(pageUrl);

          // Preload video
          preloadMasterVideo(slug);
        }
      });
    }
  }

  function handleKeyNav(e) {
    if (e.target !== document.body) return;

    const prevBtn = document.querySelector('[data-control="previous"]');
    const nextBtn = document.querySelector('[data-control="next"]');

    if (e.code === 'ArrowLeft' && prevBtn && prevBtn.href) {
      window.location.href = prevBtn.href;
    }

    if (e.code === 'ArrowRight' && nextBtn && nextBtn.href) {
      window.location.href = nextBtn.href;
    }
  }

  window.projectPlayer = {
    play,
    pause,
    mute,
    unmute,
    toggleFullscreen,
    showControls,
    hideControls,
    syncStateWithVideo,
    applyCachedVideo: setupVideoSource,
    prefetchPage,
    preloadMasterVideo,
    preloadAdjacentProjects,
    state,
    elements
  };

  function init() {
    if (state.initialized) return;

    if (!elements.video) return;

    const hasSource = setupVideoSource();

    setupVideoRatio();
    setupVideoEventListeners(); // Keep state in sync with video events
    setupControlsVisibility();
    setupPlayPause();
    setupMute();
    setupTimeline();
    setupFullscreen();
    setupNavigation();
    setupNavHoverPrefetch(); // ENHANCED: Better hover prefetching
    setupUserInteractionTracking();
    setupResizeHandler(); // Handle viewport changes for mobile icons

    // Sync state with actual video state before attempting autoplay
    syncStateWithVideo();

    attemptAutoplayWithSound();

    // ENHANCED: Preload adjacent projects immediately
    setTimeout(preloadAdjacentProjects, CONFIG.preload.backgroundDelay);

    state.initialized = true;
  }

  requeryElements();

  const initialContainer = document.querySelector('[data-barba="container"]');
  const initialNamespace = initialContainer?.getAttribute('data-barba-namespace');

  if (initialNamespace === 'project') {
    init();
  }

  document.addEventListener('barba:afterTransition', (e) => {
    if (e.detail.namespace === 'project') {
      if (state.controlsTimer) {
        clearTimeout(state.controlsTimer);
        state.controlsTimer = null;
      }

      state.initialized = false;
      state.controlsVisible = false;
      state.isPlaying = true;
      state.isMuted = true;
      state.prefetchedPages.clear();

      requeryElements();
      init();
    }
  });

})();
