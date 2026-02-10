(function () {
  'use strict';

  const CONFIG = {
    priorityCount: 4,
    viewportMargin: '200px',
    fadeTransition: 100,
    blobCacheEnabled: false,
    hiddenTags: ['Selected', 'Archive'],
    defaultFilter: 'Selected',
    stagger: {
      delay: 30,
      duration: 400,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
    },
    projectBasePath: '/projects',
    swipe: {
      threshold: 50,
      timeThreshold: 300,
      preventScroll: false
    },
    mobile: {
      breakpoint: 767,
      forceVideoCover: true,
      // MOBILE OPTIMIZATIONS
      priorityCount: 6, // Load more videos upfront on mobile
      viewportMargin: '400px', // Larger margin to start loading earlier
      preloadOnTouch: true, // Preload on touchstart
      useLoadedData: true // Don't wait for full buffer, use loadeddata
    },
    preload: {
      enabled: true,
      initialMasterCount: 8,
      hoverPreloadAhead: 4,
      backgroundPreloadDelay: 200
    }
  };

  // Detect mobile/touch device once
  const isMobile = window.innerWidth <= 767;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const state = {
    videos: new Map(),
    blobCache: new Map(),
    loadingState: new Map(),
    currentVideo: null,
    currentItem: null,
    currentFilter: CONFIG.defaultFilter,
    observer: null,
    isAnimating: false,
    touchStartY: 0,
    touchStartX: 0,
    touchStartTime: 0,
    isSwiping: false,
    initialized: false,
    swipeHandlersAttached: false,
    prefetchedPages: new Set()
  };

  // Keep these for backward compatibility
  if (!window.masterVideoCache) {
    window.masterVideoCache = new Map();
  }

  if (!window.projectVideoRegistry) {
    window.projectVideoRegistry = new Map();
  }

  // MOBILE OPTIMIZATION: Inject preconnect hints for video CDN
  // This warms up DNS/TCP/TLS before videos are requested
  function injectPreconnectHints() {
    const existingPreconnects = new Set(
      Array.from(document.querySelectorAll('link[rel="preconnect"]'))
      .map(link => link.href)
    );

    // Get first video URL to extract CDN origin
    const firstItem = document.querySelector('[data-project="item"]');
    const videoUrl = firstItem?.dataset?.videoTeaser || firstItem?.dataset?.videoMaster;

    if (videoUrl) {
      try {
        const url = new URL(videoUrl);
        const origin = url.origin;

        if (!existingPreconnects.has(origin)) {
          // Add preconnect
          const preconnect = document.createElement('link');
          preconnect.rel = 'preconnect';
          preconnect.href = origin;
          preconnect.crossOrigin = 'anonymous';
          document.head.appendChild(preconnect);

          // Add dns-prefetch as fallback
          const dnsPrefetch = document.createElement('link');
          dnsPrefetch.rel = 'dns-prefetch';
          dnsPrefetch.href = origin;
          document.head.appendChild(dnsPrefetch);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  }

  // Run preconnect injection immediately
  injectPreconnectHints();

  let elements = {
    projectItems: null,
    videoWrap: null,
    originalPlayer: null,
    filterItems: null,
    filterTags: null,
    homeHeroWrap: null
  };

  let boundHandlers = {
    touchStart: null,
    touchMove: null,
    touchEnd: null,
    container: null
  };

  function requeryElements() {
    elements.projectItems = document.querySelectorAll('[data-project="item"]');
    elements.videoWrap = document.querySelector('[data-video="wrap"]');
    elements.originalPlayer = document.querySelector('[data-video-teaser="target"]');
    elements.filterItems = document.querySelectorAll('[data-project-filter="item"]');
    elements.filterTags = document.querySelectorAll('[data-project-filter="tag"]');
    elements.homeHeroWrap = document.querySelector('.home_hero_wrap');

    state.videos.clear();
    state.loadingState.clear();
    state.currentVideo = null;
    state.currentItem = null;
    state.currentFilter = CONFIG.defaultFilter;
    state.isAnimating = false;
    state.prefetchedPages.clear();

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    removeSwipeHandlers();
  }

  function getProjectTags(item) {
    const tagLabels = item.querySelectorAll('[data-project="tag-label"]');
    return Array.from(tagLabels).map(label => label.textContent.trim());
  }

  function getVisibleProjects() {
    // Query fresh from DOM to get current order after sorting
    const allItems = document.querySelectorAll('[data-project="item"]');
    return Array.from(allItems).filter(item => {
      return item.style.display !== 'none';
    });
  }

  function getCurrentProjectIndex() {
    const visibleProjects = getVisibleProjects();
    return visibleProjects.indexOf(state.currentItem);
  }

  function getNextProject() {
    const visibleProjects = getVisibleProjects();
    const currentIndex = getCurrentProjectIndex();
    if (currentIndex === -1) return visibleProjects[0];
    const nextIndex = currentIndex + 1;
    return nextIndex < visibleProjects.length ? visibleProjects[nextIndex] : null;
  }

  function getPreviousProject() {
    const visibleProjects = getVisibleProjects();
    const currentIndex = getCurrentProjectIndex();
    if (currentIndex === -1) return visibleProjects[0];
    const prevIndex = currentIndex - 1;
    return prevIndex >= 0 ? visibleProjects[prevIndex] : null;
  }

  function getProjectSlug(item) {
    const link = item.querySelector('a[data-project-slug]');
    return link ? link.dataset.projectSlug : null;
  }

  function setupProjectLinks() {
    elements.projectItems.forEach(item => {
      const link = item.querySelector('a[data-project-slug]');
      if (!link) return;
      const slug = link.dataset.projectSlug;
      if (slug) {
        link.href = `${CONFIG.projectBasePath}/${slug}`;
      }
    });
  }

  function buildProjectVideoRegistry() {
    elements.projectItems.forEach(item => {
      const slug = getProjectSlug(item);
      const masterUrl = item.dataset.videoMaster;
      const ratio = item.dataset.videoRatio || 'cover';

      if (slug && masterUrl) {
        window.projectVideoRegistry.set(slug, {
          url: masterUrl,
          ratio: ratio
        });
      }
    });
  }

  const pendingPrefetches = new Set();

  function prefetchPage(href) {
    if (!href) return;
    if (state.prefetchedPages.has(href)) return;

    if (typeof barba === 'undefined' || !barba.cache) {
      if (!pendingPrefetches.has(href)) {
        pendingPrefetches.add(href);
      }
      return;
    }

    pendingPrefetches.delete(href);
    state.prefetchedPages.add(href);
    barba.prefetch(href);
  }

  function processPendingPrefetches() {
    if (pendingPrefetches.size === 0) return;

    if (typeof barba === 'undefined' || !barba.cache) {
      setTimeout(processPendingPrefetches, 200);
      return;
    }

    pendingPrefetches.forEach(href => {
      prefetchPage(href);
    });
  }

  setTimeout(processPendingPrefetches, 200);

  // ============================================
  // ENHANCED: Use videoCache if available
  // ============================================

  function preloadMasterVideo(url) {
    if (!url) return;

    // Use new videoCache system if available
    if (window.videoCache) {
      window.videoCache.cacheVideo(url);
      return;
    }

    // Fallback to old system
    if (window.masterVideoCache.has(url)) return;

    const video = document.createElement('video');
    video.src = url;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    window.masterVideoCache.set(url, video);

    video.load();
    video.play().catch(() => {});
  }

  // ============================================
  // ENHANCED: Preload multiple master videos
  // ============================================

  function preloadMasterVideosForProjects(projects, startIndex = 0, count = CONFIG.preload
    .initialMasterCount) {
    if (!CONFIG.preload.enabled) return;

    const urls = [];

    for (let i = startIndex; i < Math.min(startIndex + count, projects.length); i++) {
      const item = projects[i];
      const url = item?.dataset?.videoMaster;
      if (url) {
        urls.push(url);
      }
    }

    // Use videoCache for batch preloading if available
    if (window.videoCache) {
      window.videoCache.preloadMultiple(urls);
    } else {
      urls.forEach(url => preloadMasterVideo(url));
    }
  }

  function setupMasterPreloadHandlers() {
    if (!CONFIG.preload.enabled) return;

    elements.projectItems.forEach((item, index) => {
      item.addEventListener('mouseenter', () => {
        const videoUrl = item.dataset.videoMaster;
        if (videoUrl) {
          preloadMasterVideo(videoUrl);
        }

        // ENHANCED: Preload multiple projects ahead on hover
        const visibleProjects = getVisibleProjects();
        const visibleIndex = visibleProjects.indexOf(item);

        if (visibleIndex !== -1) {
          // Preload next few projects
          for (let i = 1; i <= CONFIG.preload.hoverPreloadAhead; i++) {
            const nextIndex = visibleIndex + i;
            if (nextIndex < visibleProjects.length) {
              const nextItem = visibleProjects[nextIndex];
              const nextUrl = nextItem?.dataset?.videoMaster;
              if (nextUrl) {
                preloadMasterVideo(nextUrl);
              }

              // Also prefetch the page
              const link = nextItem.querySelector('a[data-project-slug]');
              if (link && link.href) {
                prefetchPage(link.href);
              }
            }
          }
        }
      });
    });
  }

  const PREFETCH_COUNT = 6; // INCREASED from 4

  function prefetchFirstProjects() {
    if (!CONFIG.preload.enabled) return;

    const visibleProjects = getVisibleProjects();

    visibleProjects.forEach((item, index) => {
      if (index >= PREFETCH_COUNT) return;

      const link = item.querySelector('a[data-project-slug]');
      if (link && link.href) {
        prefetchPage(link.href);
      }

      const url = item.dataset.videoMaster;
      if (url) {
        preloadMasterVideo(url);
      }
    });
  }

  // ============================================
  // ENHANCED: More aggressive initial preloading
  // ============================================

  function preloadInitialVideos() {
    if (!CONFIG.preload.enabled) return;

    const visibleProjects = getVisibleProjects();

    // Preload master videos for first N projects
    preloadMasterVideosForProjects(visibleProjects, 0, CONFIG.preload.initialMasterCount);

    // Prefetch pages
    prefetchFirstProjects();
  }

  // ============================================
  // ENHANCED: Background preload all visible projects
  // ============================================

  function startBackgroundPreload() {
    if (!CONFIG.preload.enabled) return;

    const visibleProjects = getVisibleProjects();
    const allUrls = visibleProjects
      .map(item => item.dataset.videoMaster)
      .filter(Boolean);

    // Use videoCache if available for intelligent preloading
    if (window.videoCache) {
      // Let videoCache handle idle preloading
      window.videoCache.preloadMultiple(allUrls);
    }
  }

  function injectAnimationStyles() {
    const styleId = 'stagger-animation-styles';
    if (document.getElementById(styleId)) return;

    const styles = document.createElement('style');
    styles.id = styleId;
    styles.textContent = `
      [data-project="item"] {
        overflow: hidden;
      }
      
      [data-project="item"] .home_project_column {
        pointer-events: none;
        transition: transform ${CONFIG.stagger.duration}ms ${CONFIG.stagger.easing},
                    opacity ${CONFIG.stagger.duration}ms ${CONFIG.stagger.easing};
      }
      
      [data-project="item"].is-hidden .home_project_column {
        transform: translateY(100%);
        opacity: 0;
      }
      
      [data-project="item"].is-visible .home_project_column {
        transform: translateY(0);
        opacity: 1;
      }
    `;

    document.head.appendChild(styles);
  }

  function hideAllItems() {
    elements.projectItems.forEach(item => {
      item.classList.remove('is-visible', 'u-is-active');
      item.classList.add('is-hidden', 'u-is-inactive');
    });
  }

  function staggerReveal(items) {
    state.isAnimating = true;

    items.forEach((item, index) => {
      setTimeout(() => {
        item.classList.remove('is-hidden', 'u-is-inactive');
        item.classList.add('is-visible');

        if (index === items.length - 1) {
          setTimeout(() => {
            state.isAnimating = false;
          }, CONFIG.stagger.duration);
        }
      }, index * CONFIG.stagger.delay);
    });
  }

  async function fetchAsBlob(url) {
    if (state.blobCache.has(url)) {
      return state.blobCache.get(url);
    }

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      state.blobCache.set(url, blobUrl);
      return blobUrl;
    } catch (error) {
      return url;
    }
  }

  function createVideoElement(ratio) {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', ''); // iOS Safari needs attribute
    video.setAttribute('webkit-playsinline', ''); // Older iOS

    // MOBILE OPTIMIZATION: Use 'metadata' preload on mobile to start faster
    // then switch to 'auto' after first frame
    video.preload = isTouchDevice ? 'metadata' : 'auto';

    const finalRatio = (isMobile && CONFIG.mobile.forceVideoCover) ? 'cover' : ratio;

    Object.assign(video.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: finalRatio,
      opacity: '0',
      transition: `opacity ${CONFIG.fadeTransition}ms ease-out`,
      pointerEvents: 'none'
    });

    return video;
  }

  async function loadVideo(item) {
    const loadingStatus = state.loadingState.get(item);
    if (loadingStatus === 'loading' || loadingStatus === 'ready') return;

    const teaserUrl = item.dataset.videoTeaser;
    if (!teaserUrl) return;

    state.loadingState.set(item, 'loading');

    const ratio = (item.dataset.videoRatio || 'cover').toLowerCase();
    const video = createVideoElement(ratio);

    const videoUrl = CONFIG.blobCacheEnabled ?
      await fetchAsBlob(teaserUrl) :
      teaserUrl;

    video.src = videoUrl;
    elements.videoWrap.appendChild(video);
    state.videos.set(item, video);

    return new Promise((resolve) => {
      // MOBILE OPTIMIZATION: Resolve earlier on mobile
      // Use loadedmetadata (fastest) on touch devices
      // Use loadeddata on desktop (good balance)

      const resolveOnce = () => {
        if (state.loadingState.get(item) !== 'ready') {
          state.loadingState.set(item, 'ready');
          // Switch to auto preload after initial load for smoother playback
          video.preload = 'auto';
          resolve(video);
        }
      };

      if (isTouchDevice) {
        // Mobile: resolve as soon as we have metadata (dimensions, duration)
        video.addEventListener('loadedmetadata', resolveOnce, { once: true });
      } else {
        // Desktop: wait for some data to be loaded
        video.addEventListener('loadeddata', resolveOnce, { once: true });
      }

      // Fallback: resolve on canplaythrough regardless
      video.addEventListener('canplaythrough', resolveOnce, { once: true });

      // Safety timeout - don't wait forever
      setTimeout(resolveOnce, 2000);

      video.load();
    });
  }

  async function loadPriorityVideos() {
    const visibleProjects = getVisibleProjects();
    // MOBILE OPTIMIZATION: Load more videos upfront on mobile
    const priorityCount = isMobile ? CONFIG.mobile.priorityCount : CONFIG.priorityCount;
    const priorityItems = visibleProjects.slice(0, priorityCount);

    const loadPromises = priorityItems.map(item => loadVideo(item));
    await Promise.all(loadPromises);

    const firstItem = visibleProjects[0];
    if (firstItem) {
      const firstVideo = state.videos.get(firstItem);
      if (firstVideo) {
        firstVideo.style.opacity = '1';
        firstVideo.play().catch(() => {});
        state.currentVideo = firstVideo;
        setActiveItem(firstItem);
      }
    }
  }

  function setupLazyLoading() {
    const visibleProjects = getVisibleProjects();
    // MOBILE OPTIMIZATION: Use mobile-specific priority count
    const priorityCount = isMobile ? CONFIG.mobile.priorityCount : CONFIG.priorityCount;
    const lazyItems = visibleProjects.slice(priorityCount);

    if (lazyItems.length === 0) return;

    if (state.observer) {
      state.observer.disconnect();
    }

    // MOBILE OPTIMIZATION: Larger viewport margin on mobile to preload earlier
    const viewportMargin = isMobile ? CONFIG.mobile.viewportMargin : CONFIG.viewportMargin;

    state.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const item = entry.target;
          loadVideo(item);
          state.observer.unobserve(item);
        }
      });
    }, {
      rootMargin: viewportMargin,
      threshold: 0
    });

    lazyItems.forEach(item => {
      if (state.loadingState.get(item) !== 'ready') {
        state.loadingState.set(item, 'pending');
        state.observer.observe(item);
      }
    });
  }

  function setActiveItem(item) {
    const visibleProjects = getVisibleProjects();

    visibleProjects.forEach(visibleItem => {
      if (visibleItem !== item) {
        visibleItem.classList.remove('is-active', 'u-is-active');
        visibleItem.classList.add('u-is-inactive');
      }
    });

    if (state.currentItem && state.currentItem !== item) {
      state.currentItem.classList.remove('is-active', 'u-is-active');
      state.currentItem.classList.add('u-is-inactive');
    }

    if (item) {
      item.classList.remove('u-is-inactive');
      item.classList.add('is-active', 'u-is-active');
    }

    state.currentItem = item;
  }

  function setActiveFilter(filterTag) {
    elements.filterTags.forEach(tag => {
      const isInMobileMenu = tag.closest('[data-popup-target="mobile-menu"]');

      if (!isInMobileMenu) {
        tag.classList.remove('is-active', 'u-is-active');
        tag.classList.add('u-is-inactive');
      }
    });

    filterTag.classList.remove('u-is-inactive');
    filterTag.classList.add('is-active', 'u-is-active');
  }

  async function playVideo(item) {
    if (!item) return;

    if (state.loadingState.get(item) !== 'ready') {
      await loadVideo(item);
    }

    const video = state.videos.get(item);
    if (!video) return;

    if (state.currentVideo && state.currentVideo !== video) {
      state.currentVideo.style.opacity = '0';
      state.currentVideo.pause();
    }

    video.style.opacity = '1';
    video.currentTime = 0;
    video.play().catch(() => {});

    state.currentVideo = video;
    setActiveItem(item);
  }

  function handleTouchStart(e) {
    if (state.isAnimating) return;

    const blockedSelectors = [
      '[data-popup-toggle]',
      '[data-nav-toggle]',
      '[data-popup-target]',
      '[data-project-filter="tag"]',
      '.nav_wrap',
      'button'
    ];

    const isBlocked = blockedSelectors.some(selector => e.target.closest(selector));
    if (isBlocked) return;

    const touch = e.touches[0];
    state.touchStartY = touch.clientY;
    state.touchStartX = touch.clientX;
    state.touchStartTime = Date.now();
    state.isSwiping = false;
  }

  function handleTouchMove(e) {
    if (!state.touchStartY) return;

    const touch = e.touches[0];
    const deltaY = Math.abs(touch.clientY - state.touchStartY);
    const deltaX = Math.abs(touch.clientX - state.touchStartX);

    if (deltaY > deltaX && deltaY > 10) {
      state.isSwiping = true;

      if (CONFIG.swipe.preventScroll) {
        e.preventDefault();
      }
    }
  }

  function handleTouchEnd(e) {
    if (!state.touchStartY || !state.isSwiping) {
      state.touchStartY = 0;
      state.touchStartX = 0;
      state.isSwiping = false;
      return;
    }

    const touch = e.changedTouches[0];
    const deltaY = touch.clientY - state.touchStartY;
    const deltaX = Math.abs(touch.clientX - state.touchStartX);
    const deltaTime = Date.now() - state.touchStartTime;

    state.touchStartY = 0;
    state.touchStartX = 0;
    state.isSwiping = false;

    const isVerticalSwipe = Math.abs(deltaY) > deltaX;
    const isOverThreshold = Math.abs(deltaY) > CONFIG.swipe.threshold;
    const isQuickEnough = deltaTime < CONFIG.swipe.timeThreshold;

    if (isVerticalSwipe && isOverThreshold && isQuickEnough) {
      if (deltaY < 0) {
        const nextProject = getNextProject();
        if (nextProject) {
          playVideo(nextProject);
        }
      } else {
        const prevProject = getPreviousProject();
        if (prevProject) {
          playVideo(prevProject);
        }
      }
    }
  }

  function removeSwipeHandlers() {
    if (!state.swipeHandlersAttached) return;

    // Use the stored container reference instead of querying DOM
    const container = boundHandlers.container;
    if (container && boundHandlers.touchStart) {
      container.removeEventListener('touchstart', boundHandlers.touchStart);
      container.removeEventListener('touchmove', boundHandlers.touchMove);
      container.removeEventListener('touchend', boundHandlers.touchEnd);
    }

    boundHandlers.container = null;
    state.swipeHandlersAttached = false;
  }

  function setupSwipeHandlers() {
    if (state.swipeHandlersAttached) return;

    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    // Query specifically for the home container to avoid getting the wrong one during transitions
    const container = document.querySelector(
      '[data-barba="container"][data-barba-namespace="home"]');
    if (!container) return;

    boundHandlers.touchStart = handleTouchStart;
    boundHandlers.touchMove = handleTouchMove;
    boundHandlers.touchEnd = handleTouchEnd;
    boundHandlers.container = container; // Store reference for removal

    container.addEventListener('touchstart', boundHandlers.touchStart, { passive: true });
    container.addEventListener('touchmove', boundHandlers.touchMove, {
      passive: !CONFIG.swipe
        .preventScroll
    });
    container.addEventListener('touchend', boundHandlers.touchEnd, { passive: true });

    state.swipeHandlersAttached = true;
  }

  function setupClientTagVisibility() {
    elements.projectItems.forEach(item => {
      const clientName = item.querySelector('[data-project="client-name"]');
      const tagCollection = item.querySelector('[data-project="tag-collection"]');
      const tagLabels = item.querySelectorAll('[data-project="tag-label"]');

      const hasClientName = clientName && clientName.textContent.trim() !== '';

      if (hasClientName) {
        if (tagCollection) tagCollection.style.display = 'none';
      } else {
        if (clientName) clientName.style.display = 'none';

        tagLabels.forEach(label => {
          const tagText = label.textContent.trim();
          if (CONFIG.hiddenTags.includes(tagText)) {
            const tagItem = label.closest('[data-project="tag-item"]');
            if (tagItem) tagItem.style.display = 'none';
          }
        });
      }
    });
  }

  // ============================================
  // Category Sort Order
  // ============================================

  function getOrderAttributeName(filterTag) {
    // Convert filter tag to data attribute name
    // e.g., "Selected" -> "orderSelected", "Commercial" -> "orderCommercial"
    const normalized = filterTag.toLowerCase().replace(/\s+/g, '-');
    return `order${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
  }

  function getProjectOrder(item, filterTag) {
    const attrName = getOrderAttributeName(filterTag);
    const orderValue = item.dataset[attrName];

    // If no order set, return a high number to push to end
    if (!orderValue || orderValue === '') {
      return 9999;
    }

    return parseInt(orderValue, 10) || 9999;
  }

  function sortProjectsByOrder(projects, filterTag) {
    return [...projects].sort((a, b) => {
      const orderA = getProjectOrder(a, filterTag);
      const orderB = getProjectOrder(b, filterTag);
      return orderA - orderB;
    });
  }

  function reorderProjectsInDOM(sortedProjects) {
    // Get the parent container (the list element)
    const listContainer = document.querySelector('[data-project="list"]');
    if (!listContainer) return;

    // Append items in sorted order (moves them, doesn't duplicate)
    sortedProjects.forEach(item => {
      listContainer.appendChild(item);
    });
  }

  // ============================================
  // Filter Projects
  // ============================================

  function filterProjects(filterTag, animate = true) {
    state.currentFilter = filterTag;

    if (state.currentVideo) {
      state.currentVideo.style.opacity = '0';
      state.currentVideo.pause();
      state.currentVideo = null;
    }

    if (state.currentItem) {
      state.currentItem.classList.remove('is-active', 'u-is-active');
      state.currentItem.classList.add('u-is-inactive');
      state.currentItem = null;
    }

    hideAllItems();

    // Filter projects by tag
    elements.projectItems.forEach(item => {
      const tags = getProjectTags(item);
      const shouldShow = tags.includes(filterTag);
      item.style.display = shouldShow ? '' : 'none';
    });

    // Get visible projects and sort by category order
    let visibleProjects = getVisibleProjects();
    visibleProjects = sortProjectsByOrder(visibleProjects, filterTag);

    // Reorder in the DOM so the sorted order is reflected
    reorderProjectsInDOM(visibleProjects);

    // Re-query after reordering to get correct order
    visibleProjects = getVisibleProjects();

    if (animate) {
      requestAnimationFrame(() => staggerReveal(visibleProjects));
    } else {
      visibleProjects.forEach(item => {
        item.classList.remove('is-hidden', 'u-is-inactive');
        item.classList.add('is-visible');
      });
    }

    if (visibleProjects.length > 0) {
      playVideo(visibleProjects[0]);
    }

    setupLazyLoading();

    // ENHANCED: Preload master videos for newly visible projects
    preloadMasterVideosForProjects(visibleProjects, 0, CONFIG.preload.initialMasterCount);
    prefetchFirstProjects();
  }

  function setupHoverHandlers() {
    elements.projectItems.forEach(item => {
      item.addEventListener('mouseenter', () => {
        if (item.style.display === 'none') return;
        if (state.isAnimating) return;

        playVideo(item);

        const visibleProjects = getVisibleProjects();
        const itemIndex = visibleProjects.indexOf(item);

        if (itemIndex >= PREFETCH_COUNT) {
          const link = item.querySelector('a[data-project-slug]');
          if (link && link.href) {
            prefetchPage(link.href);
          }

          const videoUrl = item.dataset.videoMaster;
          if (videoUrl) {
            preloadMasterVideo(videoUrl);
          }
        }
      });
    });
  }

  // MOBILE OPTIMIZATION: Touch-based preloading
  // Preload on touchstart (before click) to get a head start
  function setupTouchPreload() {
    if (!isTouchDevice || !CONFIG.mobile.preloadOnTouch) return;

    elements.projectItems.forEach(item => {
      item.addEventListener('touchstart', () => {
        if (item.style.display === 'none') return;

        // Immediately load teaser video if not ready
        if (state.loadingState.get(item) !== 'ready') {
          loadVideo(item);
        }

        // Preload the master video for project page
        const videoUrl = item.dataset.videoMaster;
        if (videoUrl) {
          preloadMasterVideo(videoUrl);
        }

        // Prefetch the project page
        const link = item.querySelector('a[data-project-slug]');
        if (link && link.href) {
          prefetchPage(link.href);
        }

        // Also preload next 2 items
        const visibleProjects = getVisibleProjects();
        const itemIndex = visibleProjects.indexOf(item);
        for (let i = 1; i <= 2; i++) {
          const nextItem = visibleProjects[itemIndex + i];
          if (nextItem && state.loadingState.get(nextItem) !== 'ready') {
            loadVideo(nextItem);
          }
        }
      }, { passive: true });
    });
  }

  function setupHoverPreload() {
    elements.projectItems.forEach((item, index) => {
      item.addEventListener('mouseenter', () => {
        // ENHANCED: Preload more items ahead
        const nextItems = [];
        for (let i = 1; i <= 3; i++) {
          if (elements.projectItems[index + i]) {
            nextItems.push(elements.projectItems[index + i]);
          }
        }

        nextItems.forEach(nextItem => {
          if (state.loadingState.get(nextItem) === 'pending') {
            loadVideo(nextItem);
          }
        });
      });
    });
  }

  function setupFilterHandlers() {
    elements.filterTags.forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.preventDefault();
        if (state.isAnimating) return;

        const filterTag = tag.textContent.trim();
        setActiveFilter(tag);
        filterProjects(filterTag);
      });
    });
  }

  function initializeFilterState() {
    elements.filterTags.forEach(tag => {
      const isInMobileMenu = tag.closest('[data-popup-target="mobile-menu"]');

      if (!isInMobileMenu) {
        tag.classList.remove('is-active', 'u-is-active');
        tag.classList.add('u-is-inactive');

        if (tag.textContent.trim() === CONFIG.defaultFilter) {
          tag.classList.remove('u-is-inactive');
          tag.classList.add('is-active', 'u-is-active');
        }
      }
    });

    elements.projectItems.forEach(item => item.classList.add('u-is-inactive'));
    filterProjects(CONFIG.defaultFilter, true);
  }

  function getStats() {
    const states = Array.from(state.loadingState.values());
    return {
      total: states.length,
      ready: states.filter(s => s === 'ready').length,
      loading: states.filter(s => s === 'loading').length,
      pending: states.filter(s => s === 'pending').length,
      blobsCached: state.blobCache.size,
      masterCached: window.masterVideoCache.size,
      videoCacheStats: window.videoCache ? window.videoCache.getStats() : null,
      registrySize: window.projectVideoRegistry.size,
      currentFilter: state.currentFilter,
      visibleProjects: getVisibleProjects().length,
      isAnimating: state.isAnimating,
      prefetchedPages: state.prefetchedPages.size
    };
  }

  window.videoPreloader = {
    getStats,
    loadAll: () => Promise.all(Array.from(elements.projectItems).map(loadVideo)),
    filterProjects,
    nextProject: () => playVideo(getNextProject()),
    prevProject: () => playVideo(getPreviousProject()),
    preloadMaster: preloadMasterVideo,
    prefetchPage,
    masterCache: window.masterVideoCache,
    registry: window.projectVideoRegistry,
    state
  };

  async function init() {
    if (state.initialized) return;

    if (elements.originalPlayer) {
      elements.originalPlayer.remove();
    }

    injectAnimationStyles();

    elements.projectItems.forEach(item => {
      state.loadingState.set(item, 'pending');
    });

    setupProjectLinks();
    buildProjectVideoRegistry();
    setupClientTagVisibility();
    setupHoverHandlers();
    setupHoverPreload();
    setupTouchPreload(); // MOBILE OPTIMIZATION
    setupMasterPreloadHandlers();
    setupFilterHandlers();
    setupSwipeHandlers();

    initializeFilterState();

    await loadPriorityVideos();

    setupLazyLoading();

    // OPTIMIZED: Start preloading immediately
    preloadInitialVideos();

    // OPTIMIZED: Background preload with minimal delay
    setTimeout(startBackgroundPreload, CONFIG.preload.backgroundPreloadDelay);

    state.initialized = true;
  }

  requeryElements();

  const initialContainer = document.querySelector('[data-barba="container"]');
  if (initialContainer && initialContainer.getAttribute('data-barba-namespace') === 'home') {
    init();
  }

  document.addEventListener('barba:afterTransition', (e) => {
    if (e.detail.namespace === 'home') {
      state.initialized = false;
      requeryElements();
      init();
    }
  });

})();
