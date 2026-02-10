(function () {
  'use strict';

  const CONFIG = {
    delays: {
      afterPreloader: 400,
      afterTransition: 300,
      afterTransitionHome: 200
    },
    animation: {
      duration: 0.5,
      stagger: 0.08,
      ease: 'power2.out',
      y: 0
    },
    preloaderCheckTimeout: 5000,
    preloaderCheckInterval: 50
  };

  const state = {
    isFirstLoad: true,
    isAnimating: false,
    hasRevealed: false
  };

  function getCurrentNamespace() {
    const container = document.querySelector('[data-barba="container"]');
    return container?.getAttribute('data-barba-namespace') || null;
  }

  function revealElements(delay = 0) {
    const elements = document.querySelectorAll('[data-delay]');

    if (elements.length === 0) return;

    if (state.isAnimating) return;

    state.isAnimating = true;
    state.hasRevealed = false;

    setTimeout(() => {
      gsap.to(elements, {
        opacity: 1,
        visibility: 'visible',
        y: 0,
        duration: CONFIG.animation.duration,
        stagger: CONFIG.animation.stagger,
        ease: CONFIG.animation.ease,
        onComplete: () => {
          state.isAnimating = false;
          state.hasRevealed = true;

          if (window.projectPlayer && getCurrentNamespace() === 'project') {
            window.projectPlayer.showControls();
          }
        }
      });
    }, delay);
  }

  function hideElements() {
    const elements = document.querySelectorAll('[data-delay]');

    if (elements.length === 0) return;

    gsap.killTweensOf(elements);

    elements.forEach(el => {
      el.classList.remove('is-revealed');
    });

    state.isAnimating = false;
    state.hasRevealed = false;
  }

  function waitForPreloaderComplete() {
    return new Promise((resolve) => {
      const startTime = Date.now();

      function check() {
        if (window.preloader && window.preloader.state.isComplete) {
          resolve();
          return;
        }

        if (window.preloader && !window.preloader.state.isComplete) {
          setTimeout(check, CONFIG.preloaderCheckInterval);
          return;
        }

        if (Date.now() - startTime < CONFIG.preloaderCheckTimeout) {
          setTimeout(check, CONFIG.preloaderCheckInterval);
          return;
        }

        resolve();
      }

      check();
    });
  }

  async function handleFirstLoad() {
    const namespace = getCurrentNamespace();

    hideElements();

    if (namespace === 'home') {
      await waitForPreloaderComplete();
      revealElements(CONFIG.delays.afterPreloader);
    } else {
      revealElements(CONFIG.delays.afterTransition);
    }

    state.isFirstLoad = false;
  }

  function handleTransition(namespace) {
    const delay = namespace === 'home' ?
      CONFIG.delays.afterTransitionHome :
      CONFIG.delays.afterTransition;

    revealElements(delay);
  }

  document.addEventListener('barba:beforeLeave', () => {
    hideElements();
  });

  document.addEventListener('barba:afterTransition', (e) => {
    setTimeout(() => {
      handleTransition(e.detail.namespace);
    }, 100);
  });

  window.delayManager = {
    reveal: revealElements,
    hide: hideElements,
    state,
    CONFIG
  };

  function init() {
    const elements = document.querySelectorAll('[data-delay]');
    elements.forEach(el => {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
    });

    handleFirstLoad();
  }

  init();

})();
