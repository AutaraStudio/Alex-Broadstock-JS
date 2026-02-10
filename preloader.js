(function () {
  'use strict';

  // ============================================
  // DEBUG MODE
  // ============================================
  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log('[Preloader]', ...args);
  }

  function logElement(label, el) {
    if (!DEBUG) return;
    if (!el) {
      console.log(`[Preloader] ${label}: NULL/UNDEFINED`);
      return;
    }
    const computed = getComputedStyle(el);
    console.log(`[Preloader] ${label}:`, {
      element: el,
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      zIndex: computed.zIndex,
      position: computed.position,
      width: computed.width,
      height: computed.height,
      background: computed.backgroundColor,
      clipPath: computed.clipPath
    });
  }

  const CONFIG = {
    timing: {
      textIn: 0.35,
      textInStagger: 0.02,
      hold: 0.8,
      textOut: 0.3,
      textOutStagger: 0.015,
      pauseBeforeReveal: 0.4,
      curtainReveal: 1,
      frameExpand: 1.2,
      fadeOut: 0.35
    },
    window: {
      desktop: { width: 20, height: 20 },
      tablet: { width: 20, height: 20 },
      mobile: { width: 70, height: 40 }
    },
    breakpoints: {
      tablet: 991,
      mobile: 767
    },
    easing: {
      textIn: 'cinematicIn',
      textOut: 'cinematicOut',
      curtain: 'slowStart',
      frameExpand: 'smoothExpand',
      fadeOut: 'power2.out'
    },
    defaultFilter: 'Selected'
  };

  const state = {
    isComplete: false,
    videoReady: false,
    timeline: null,
    splitText: null,
    hasRun: false,
    isMobile: false
  };

  let elements = {
    wrap: null,
    frame: null,
    frameTop: null,
    frameRight: null,
    frameBottom: null,
    frameLeft: null,
    curtain: null,
    text: null,
    videoWrap: null,
    projectItems: null
  };

  function queryElements() {
    elements.wrap = document.querySelector('[data-preloader="wrap"]');
    elements.frame = document.querySelector('[data-preloader="frame"]');
    elements.frameTop = document.querySelector('[data-preloader="frame-top"]');
    elements.frameRight = document.querySelector('[data-preloader="frame-right"]');
    elements.frameBottom = document.querySelector('[data-preloader="frame-bottom"]');
    elements.frameLeft = document.querySelector('[data-preloader="frame-left"]');
    elements.curtain = document.querySelector('[data-preloader="curtain"]');
    elements.text = document.querySelector('[data-preloader="text"]');
    elements.videoWrap = document.querySelector('[data-video="wrap"]');
    elements.projectItems = document.querySelectorAll('[data-project="item"]');

    log('queryElements complete:', {
      wrap: !!elements.wrap,
      frame: !!elements.frame,
      frameTop: !!elements.frameTop,
      frameRight: !!elements.frameRight,
      frameBottom: !!elements.frameBottom,
      frameLeft: !!elements.frameLeft,
      curtain: !!elements.curtain,
      text: !!elements.text,
      videoWrap: !!elements.videoWrap,
      projectItems: elements.projectItems?.length
    });
  }

  function getWindowSize() {
    const screenWidth = window.innerWidth;

    if (screenWidth <= CONFIG.breakpoints.mobile) {
      return CONFIG.window.mobile;
    } else if (screenWidth <= CONFIG.breakpoints.tablet) {
      return CONFIG.window.tablet;
    } else {
      return CONFIG.window.desktop;
    }
  }

  function checkIfMobile() {
    state.isMobile = window.innerWidth <= CONFIG.breakpoints.mobile;
    return state.isMobile;
  }

  function removePreloaderImmediately() {
    log('removePreloaderImmediately() called');

    const preloaderWrap = document.querySelector('[data-preloader="wrap"]');
    if (preloaderWrap) {
      preloaderWrap.remove();
    }

    const videoWrap = document.querySelector('[data-video="wrap"]');
    if (videoWrap) {
      videoWrap.style.inset = '';
      videoWrap.style.zIndex = '';

      gsap.set(videoWrap, {
        clearProps: 'top,left,right,bottom,width,height,xPercent,yPercent,opacity'
      });

      const isMobile = window.innerWidth <= CONFIG.breakpoints.mobile;
      if (isMobile) {
        const videos = videoWrap.querySelectorAll('video');
        videos.forEach(video => {
          video.style.objectFit = 'cover';
        });
      }

      const curtain = document.querySelector('[data-preloader="curtain"]');
      if (curtain) {
        curtain.style.cssText = '';
        gsap.set(curtain, {
          clearProps: 'all'
        });
      }

      const text = document.querySelector('[data-preloader="text"]');
      if (text) {
        text.style.position = '';
        text.style.zIndex = '';
      }
    }
  }

  function registerCustomEasing() {
    CustomEase.create('cinematicIn', '0.16, 1, 0.3, 1');
    CustomEase.create('cinematicOut', '0.7, 0, 0.84, 0');
    CustomEase.create('slowStart', '0.6, 0, 0.4, 1');
    CustomEase.create('smoothExpand', '0.25, 0.1, 0.25, 1');
  }

  function getFramePositions(windowWidthPercent, windowHeightPercent) {
    const topHeight = (100 - windowHeightPercent) / 2;
    const bottomHeight = (100 - windowHeightPercent) / 2;
    const leftWidth = (100 - windowWidthPercent) / 2;
    const rightWidth = (100 - windowWidthPercent) / 2;

    return {
      top: `${topHeight}%`,
      bottom: `${bottomHeight}%`,
      left: `${leftWidth}%`,
      right: `${rightWidth}%`
    };
  }

  function initPreloader() {
    log('initPreloader() called');
    log('elements.wrap:', !!elements.wrap);

    if (!elements.wrap) {
      log('ERROR: No wrap element, returning early');
      return;
    }

    log('Adding is-active class to wrap');
    elements.wrap.classList.add('is-active');

    log('state.isMobile:', state.isMobile);
    logElement('wrap after is-active', elements.wrap);
    logElement('curtain initial', elements.curtain);
    logElement('text initial', elements.text);
    logElement('videoWrap initial', elements.videoWrap);

    if (state.isMobile) {
      log('MOBILE PATH');
      const windowSize = getWindowSize();
      log('windowSize:', windowSize);

      gsap.set(elements.frameTop, { height: '0%' });
      gsap.set(elements.frameBottom, { height: '0%' });
      gsap.set(elements.frameLeft, { width: '0%' });
      gsap.set(elements.frameRight, { width: '0%' });
      log('Frame bars hidden');

      const curtainW = `${windowSize.width + 5}vw`;
      const curtainH = `${windowSize.height + 5}vh`;
      log('Curtain size:', curtainW, curtainH);

      elements.curtain.style.position = 'absolute';
      elements.curtain.style.width = curtainW;
      elements.curtain.style.height = curtainH;
      elements.curtain.style.top = '50%';
      elements.curtain.style.left = '50%';
      elements.curtain.style.right = 'auto';
      elements.curtain.style.bottom = 'auto';
      elements.curtain.style.transform = 'translate(-50%, -50%)';
      elements.curtain.style.zIndex = '1';

      gsap.set(elements.curtain, {
        clipPath: 'inset(0% 0% 0% 0%)'
      });

      logElement('curtain after setup', elements.curtain);

      if (elements.text) {
        log('Setting text z-index to 9999');
        elements.text.style.position = 'relative';
        elements.text.style.zIndex = '9999';
        logElement('text after z-index', elements.text);
      } else {
        log('WARNING: text element not found!');
      }

      if (elements.videoWrap) {
        log('Setting up videoWrap');

        const videos = elements.videoWrap.querySelectorAll('video');
        videos.forEach(video => {
          video.style.objectFit = 'cover';
        });
        log('Forced videos to cover');

        elements.videoWrap.style.inset = 'auto';
        elements.videoWrap.style.zIndex = '0';

        gsap.set(elements.videoWrap, {
          top: '50%',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          width: `${windowSize.width}vw`,
          height: `${windowSize.height}vh`,
          xPercent: -50,
          yPercent: -50,
          opacity: 0
        });

        logElement('videoWrap after setup', elements.videoWrap);
      } else {
        log('WARNING: videoWrap not found!');
      }

      log('MOBILE initPreloader complete');

    } else {
      // DESKTOP/TABLET: Full frame + curtain animation
      const windowSize = getWindowSize();

      gsap.set(elements.frameTop, { height: '50%' });
      gsap.set(elements.frameBottom, { height: '50%' });
      gsap.set(elements.frameLeft, { width: '50%' });
      gsap.set(elements.frameRight, { width: '50%' });

      // Size curtain to match video window dimensions
      gsap.set(elements.curtain, {
        width: `${windowSize.width}%`,
        height: `${windowSize.height}%`,
        clipPath: 'inset(0% 0% 0% 0%)'
      });

      if (elements.videoWrap) {
        const initialStyles = {
          top: '50%',
          left: '50%',
          right: 'auto',
          bottom: 'auto',
          width: `${windowSize.width}%`,
          height: `${windowSize.height}%`,
          xPercent: -50,
          yPercent: -50
        };

        elements.videoWrap.style.inset = 'auto';
        gsap.set(elements.videoWrap, initialStyles);
      }
    }
  }

  function createTimeline() {
    log('createTimeline() called');
    log('elements.text:', !!elements.text);

    const tl = gsap.timeline({
      paused: true,
      onComplete: onPreloaderComplete
    });

    if (!elements.text) {
      log('ERROR: No text element for SplitText!');
      return tl;
    }

    log('Creating SplitText');
    state.splitText = new SplitText(elements.text, {
      type: 'chars',
      charsClass: 'preloader_char'
    });

    const chars = state.splitText.chars;
    log('SplitText chars count:', chars?.length);

    elements.text.classList.add('is-ready');
    log('Added is-ready class to text');

    gsap.set(chars, {
      opacity: 0
    });
    log('Set chars opacity to 0');

    tl.to(chars, {
      opacity: 1,
      duration: CONFIG.timing.textIn,
      stagger: CONFIG.timing.textInStagger,
      ease: CONFIG.easing.textIn
    }, 'start');

    tl.to({}, {
      duration: CONFIG.timing.hold
    });

    tl.to(chars, {
      opacity: 0,
      duration: CONFIG.timing.textOut,
      stagger: CONFIG.timing.textOutStagger,
      ease: CONFIG.easing.textOut
    });

    tl.to({}, {
      duration: CONFIG.timing.pauseBeforeReveal
    });

    const windowSize = getWindowSize();
    const openPositions = getFramePositions(windowSize.width, windowSize.height);
    log('Timeline windowSize:', windowSize);
    log('Timeline openPositions:', openPositions);

    if (state.isMobile) {
      log('MOBILE timeline path');

      tl.to(elements.videoWrap, {
        opacity: 1,
        duration: 0.3,
        ease: 'power2.out'
      }, 'openWindow');

      tl.to(elements.curtain, {
        clipPath: 'inset(0% 0% 0% 100%)',
        duration: CONFIG.timing.curtainReveal,
        ease: CONFIG.easing.curtain
      }, 'openWindow');

    } else {
      tl.to(elements.frameTop, {
        height: openPositions.top,
        duration: CONFIG.timing.curtainReveal * 0.6,
        ease: CONFIG.easing.curtain
      }, 'openWindow');

      tl.to(elements.frameBottom, {
        height: openPositions.bottom,
        duration: CONFIG.timing.curtainReveal * 0.6,
        ease: CONFIG.easing.curtain
      }, 'openWindow');

      tl.to(elements.frameLeft, {
        width: openPositions.left,
        duration: CONFIG.timing.curtainReveal * 0.6,
        ease: CONFIG.easing.curtain
      }, 'openWindow');

      tl.to(elements.frameRight, {
        width: openPositions.right,
        duration: CONFIG.timing.curtainReveal * 0.6,
        ease: CONFIG.easing.curtain
      }, 'openWindow');

      tl.to(elements.curtain, {
        clipPath: 'inset(0% 0% 0% 100%)',
        duration: CONFIG.timing.curtainReveal,
        ease: CONFIG.easing.curtain
      }, 'openWindow+=0.2');
    }

    if (state.isMobile) {
      if (elements.videoWrap) {
        tl.to(elements.videoWrap, {
          width: '100%',
          height: '100%',
          duration: CONFIG.timing.frameExpand,
          ease: CONFIG.easing.curtain,
          onStart: () => {},
          onComplete: () => {}
        }, 'expandFrame');
      }

    } else {
      tl.to(elements.frameTop, {
        height: '0%',
        duration: CONFIG.timing.frameExpand,
        ease: CONFIG.easing.curtain
      }, 'expandFrame');

      tl.to(elements.frameBottom, {
        height: '0%',
        duration: CONFIG.timing.frameExpand,
        ease: CONFIG.easing.curtain
      }, 'expandFrame');

      tl.to(elements.frameLeft, {
        width: '0%',
        duration: CONFIG.timing.frameExpand,
        ease: CONFIG.easing.curtain
      }, 'expandFrame');

      tl.to(elements.frameRight, {
        width: '0%',
        duration: CONFIG.timing.frameExpand,
        ease: CONFIG.easing.curtain
      }, 'expandFrame');

      if (elements.videoWrap) {
        tl.to(elements.videoWrap, {
          width: '100%',
          height: '100%',
          duration: CONFIG.timing.frameExpand,
          ease: CONFIG.easing.curtain,
          onStart: () => {},
          onComplete: () => {}
        }, 'expandFrame');
      }
    }

    tl.addLabel('expandFrame', '>-0.4');

    tl.to(elements.wrap, {
      opacity: 0,
      duration: CONFIG.timing.fadeOut,
      ease: CONFIG.easing.fadeOut
    }, '>-0.2');

    state.timeline = tl;
    log('createTimeline() complete, timeline duration:', tl.duration());
    return tl;
  }

  function onPreloaderComplete() {
    log('onPreloaderComplete() called');

    state.isComplete = true;
    state.hasRun = true;

    if (elements.wrap) {
      log('Removing is-active, adding is-complete to wrap');
      elements.wrap.classList.remove('is-active');
      elements.wrap.classList.add('is-complete');
    }

    if (state.splitText) {
      log('Reverting SplitText');
      state.splitText.revert();
    }

    if (elements.videoWrap) {
      log('Resetting videoWrap positioning');

      elements.videoWrap.style.inset = '';
      elements.videoWrap.style.zIndex = '';

      gsap.set(elements.videoWrap, {
        clearProps: 'top,left,right,bottom,width,height,xPercent,yPercent,opacity'
      });

      logElement('videoWrap after reset', elements.videoWrap);

      if (state.isMobile) {
        if (elements.curtain) {
          elements.curtain.style.cssText = '';
          gsap.set(elements.curtain, {
            clearProps: 'all'
          });
        }

        if (elements.text) {
          elements.text.style.position = '';
          elements.text.style.zIndex = '';
        }
      }
    }
  }

  function waitForVideoReady() {
    return new Promise((resolve) => {
      const checkVideo = () => {
        if (!window.videoPreloader) return false;

        const stats = window.videoPreloader.getStats();
        if (stats.ready === 0) return false;

        const videoWrap = document.querySelector('[data-video="wrap"]');
        const videos = videoWrap?.querySelectorAll('video');
        if (!videos || videos.length === 0) return false;

        const activeVideo = Array.from(videos).find(video => {
          return video.style.opacity === '1' ||
            getComputedStyle(video).opacity === '1';
        });

        if (!activeVideo) return false;
        if (activeVideo.readyState < 3) return false;
        if (activeVideo.paused) return false;

        return true;
      };

      if (checkVideo()) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
        return;
      }

      const interval = setInterval(() => {
        if (checkVideo()) {
          clearInterval(interval);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }
      }, 50);

      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 8000);
    });
  }

  async function startPreloader() {
    log('startPreloader() - waiting for video ready...');
    await waitForVideoReady();
    log('Video ready! Playing timeline');
    log('Timeline exists:', !!state.timeline);
    if (state.timeline) {
      state.timeline.play();
      log('Timeline.play() called');
    } else {
      log('ERROR: No timeline to play!');
    }
  }

  window.preloader = {
    play: () => state.timeline?.play(),
    pause: () => state.timeline?.pause(),
    restart: () => state.timeline?.restart(),
    seek: (time) => state.timeline?.seek(time),
    state,
    CONFIG,
    getWindowSize
  };

  function init() {
    log('init() called');
    log('state.hasRun:', state.hasRun);

    if (state.hasRun) {
      log('Preloader already ran, removing immediately');
      removePreloaderImmediately();
      return;
    }

    queryElements();

    log('Elements found:', {
      wrap: !!elements.wrap,
      videoWrap: !!elements.videoWrap,
      frameTop: !!elements.frameTop,
      curtain: !!elements.curtain,
      text: !!elements.text
    });

    if (!elements.wrap) {
      log('ERROR: No wrap element found!');
      return;
    }

    const initialContainer = document.querySelector('[data-barba="container"]');
    const namespace = initialContainer?.getAttribute('data-barba-namespace');
    log('Namespace:', namespace);

    if (!initialContainer || namespace !== 'home') {
      log('Not on home page, removing preloader');
      removePreloaderImmediately();
      return;
    }

    checkIfMobile();
    log('isMobile:', state.isMobile);

    registerCustomEasing();
    log('Custom easing registered');

    initPreloader();
    log('initPreloader complete');

    createTimeline();
    log('createTimeline complete');

    startPreloader();
    log('startPreloader called');
  }

  init();

  document.addEventListener('barba:afterTransition', (e) => {
    removePreloaderImmediately();
  });

})();
