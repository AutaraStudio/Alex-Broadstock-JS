(function () {
  'use strict';

  const CONFIG = {
    transitionDuration: 150,
    closeText: 'Close'
  };

  const state = {
    activePopup: null,
    isAnimating: false,
    originalToggleText: new Map(),
    wasPlayingBeforePopup: false,
    activeToggleElement: null,
    mobileMenuToggle: null,
    initialized: false
  };

  let elements = {
    overlay: null,
    popupToggles: null,
    popupTargets: null,
    navToggles: null,
    navItems: null
  };

  function requeryElements() {
    elements.overlay = document.querySelector('[data-toggle="overlay"]');
    elements.popupToggles = document.querySelectorAll('[data-popup-toggle]');
    elements.popupTargets = document.querySelectorAll('[data-popup-target]');
    elements.navToggles = document.querySelectorAll('[data-nav-toggle]');
    elements.navItems = document.querySelectorAll('[data-nav="item"]');
  }

  function isHomePage() {
    const container = document.querySelector('[data-barba="container"]');
    return container?.getAttribute('data-barba-namespace') === 'home';
  }

  function getPopupTarget(name) {
    return document.querySelector(`[data-popup-target="${name}"]`);
  }

  function getPopupToggle(name) {
    return document.querySelector(`[data-popup-toggle="${name}"]`);
  }

  function getNavToggle(name) {
    return document.querySelector(`[data-nav-toggle="${name}"]`);
  }

  function fadeOutHomeElements() {
    if (!isHomePage()) return;

    const filterWrap = document.querySelector('[data-project-filter="wrap"]');
    const projectCollection = document.querySelector('[data-project="collection"]');

    const targets = [filterWrap, projectCollection].filter(Boolean);

    if (targets.length > 0) {
      gsap.to(targets, {
        opacity: 0,
        duration: CONFIG.transitionDuration / 1000,
        ease: 'power2.out'
      });
    }
  }

  function fadeInHomeElements() {
    if (!isHomePage()) return;

    const filterWrap = document.querySelector('[data-project-filter="wrap"]');
    const projectCollection = document.querySelector('[data-project="collection"]');

    const targets = [filterWrap, projectCollection].filter(Boolean);

    if (targets.length > 0) {
      gsap.to(targets, {
        opacity: 1,
        duration: CONFIG.transitionDuration / 1000,
        ease: 'power2.out'
      });
    }
  }

  function showOverlay() {
    if (elements.overlay) {
      elements.overlay.classList.add('is-active');
    }
    fadeOutHomeElements();
  }

  function hideOverlay() {
    if (elements.overlay) {
      elements.overlay.classList.remove('is-active');
    }
    fadeInHomeElements();
  }

  function setActiveNavItem(popupName) {
    const navItems = document.querySelectorAll('[data-nav="item"]');

    const navToggle = getNavToggle(popupName);
    const popupToggle = getPopupToggle(popupName);

    let activeNavItem = null;

    if (navToggle) {
      activeNavItem = navToggle.closest('[data-nav="item"]') || navToggle;
    } else if (popupToggle) {
      activeNavItem = popupToggle.closest('[data-nav="item"]') || popupToggle;
    }

    navItems.forEach(item => {
      if (item === activeNavItem) {
        item.classList.remove('u-is-inactive');
        item.classList.add('u-is-active');
      } else {
        item.classList.remove('u-is-active');
        item.classList.add('u-is-inactive');
      }
    });
  }

  function resetNavItems() {
    const navItems = document.querySelectorAll('[data-nav="item"]');

    navItems.forEach(item => {
      item.classList.remove('u-is-active', 'u-is-inactive');
    });
  }

  function storeOriginalText(element) {
    if (!state.originalToggleText.has(element)) {
      state.originalToggleText.set(element, element.textContent);
    }
  }

  function setText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  function restoreText(element) {
    if (element && state.originalToggleText.has(element)) {
      element.textContent = state.originalToggleText.get(element);
    }
  }

  function openPopup(name, toggle, isSwitch = false) {
    if (state.isAnimating) return;
    if (state.activePopup === name) return;

    const popup = getPopupTarget(name);

    if (!popup) return;

    state.isAnimating = true;

    const previousPopup = state.activePopup;
    state.activePopup = name;
    state.activeToggleElement = toggle;

    if (name === 'mobile-menu') {
      state.mobileMenuToggle = toggle;
    }

    // Determine overlay requirements
    const needsOverlay = name !== 'bts';
    const previousHadOverlay = previousPopup && previousPopup !== 'bts';

    if (isSwitch) {
      // Switching between popups - handle overlay transitions
      if (needsOverlay && !previousHadOverlay) {
        // Switching TO a popup that needs overlay FROM one that didn't (bts → about/info)
        showOverlay();
      } else if (!needsOverlay && previousHadOverlay) {
        // Switching FROM a popup that had overlay TO one that doesn't (about/info → bts)
        hideOverlay();
      }
      // If both need overlay or both don't, keep overlay state as-is
    } else {
      // Opening fresh (no previous popup)
      if (needsOverlay) {
        showOverlay();
      }
    }

    // Duck volume when opening first popup (not when switching between popups)
    // This ensures audio ducks whether opening directly or via mobile menu
    if (!previousPopup && window.barbaTransition && window.barbaTransition.duckVolume) {
      window.barbaTransition.duckVolume();
    }

    popup.classList.add('is-active');

    if (toggle) {
      toggle.classList.add('is-active');
      storeOriginalText(toggle);
      setText(toggle, CONFIG.closeText);
    }

    setActiveNavItem(name);

    setTimeout(() => {
      state.isAnimating = false;
    }, CONFIG.transitionDuration);
  }

  function closePopup(name, isSwitch = false) {
    if (state.isAnimating) return;

    const popup = getPopupTarget(name);
    const toggle = state.activeToggleElement;

    if (!popup) return;

    state.isAnimating = true;

    if (toggle) {
      restoreText(toggle);
      toggle.classList.remove('is-active');
    }

    popup.classList.remove('is-active');

    if (!isSwitch) {
      // Don't hide overlay if BTS (it was never shown)
      if (name !== 'bts') {
        hideOverlay();
      }

      if (window.barbaTransition && window.barbaTransition.restoreVolume) {
        window.barbaTransition.restoreVolume();
      }
    }

    setTimeout(() => {
      if (!isSwitch) {
        state.activePopup = null;
        state.activeToggleElement = null;
        state.mobileMenuToggle = null;
        resetNavItems();
      }
      state.isAnimating = false;
    }, CONFIG.transitionDuration);
  }

  function closeActivePopup() {
    if (state.activePopup) {
      closePopup(state.activePopup, false);
    }
  }

  function togglePopup(name, newToggle) {
    if (state.activePopup === name) {
      closePopup(name, false);
      return;
    }

    if (state.activePopup) {
      const previousToggle = state.activeToggleElement;
      const previousPopup = getPopupTarget(state.activePopup);
      const fromMobileMenu = state.activePopup === 'mobile-menu';

      if (!fromMobileMenu && previousToggle) {
        previousToggle.classList.remove('is-active');
        restoreText(previousToggle);
      }

      if (previousPopup) {
        previousPopup.classList.remove('is-active');
      }

      openPopup(name, newToggle, true);
    } else {
      openPopup(name, newToggle, false);
    }
  }

  function handleNavToggle(e, toggle) {
    const action = toggle.dataset.navToggle;

    switch (action) {
    case 'back-close':
      break;

    case 'bts':
      e.preventDefault();
      togglePopup('bts', toggle);
      break;

    case 'info':
      e.preventDefault();
      togglePopup('info', toggle);
      break;

    default:
      break;
    }
  }

  function setupMobileMenuHandlers() {
    const mobileMenuPopup = document.querySelector('[data-popup-target="mobile-menu"]');
    if (!mobileMenuPopup) return;

    const mobileFilterTags = mobileMenuPopup.querySelectorAll('[data-project-filter="tag"]');
    mobileFilterTags.forEach(tag => {
      tag.addEventListener('click', () => {
        setTimeout(() => {
          if (state.activePopup === 'mobile-menu') {
            closePopup('mobile-menu', false);
          }
        }, 50);
      });
    });
  }

  function setupPopupHandlers() {
    elements.popupToggles.forEach(toggle => {
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);

      newToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const popupName = newToggle.dataset.popupToggle;
        togglePopup(popupName, newToggle);
      });
    });

    elements.navToggles.forEach(toggle => {
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);

      newToggle.addEventListener('click', (e) => {
        handleNavToggle(e, newToggle);
      });
    });

    if (elements.overlay) {
      const newOverlay = elements.overlay.cloneNode(true);
      elements.overlay.parentNode.replaceChild(newOverlay, elements.overlay);
      elements.overlay = newOverlay;

      elements.overlay.addEventListener('click', closeActivePopup);
    }

    elements.popupToggles = document.querySelectorAll('[data-popup-toggle]');
    elements.navToggles = document.querySelectorAll('[data-nav-toggle]');
    elements.navItems = document.querySelectorAll('[data-nav="item"]');
  }

  function setupKeyboardHandler() {
    if (window._popupKeyboardHandlerSet) return;

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && state.activePopup) {
        closeActivePopup();
      }
    });

    window._popupKeyboardHandlerSet = true;
  }

  window.popupController = {
    openPopup,
    closePopup,
    togglePopup,
    closeActivePopup,
    state,
    reinit: init
  };

  function init() {
    state.activePopup = null;
    state.isAnimating = false;
    state.activeToggleElement = null;
    state.mobileMenuToggle = null;
    state.originalToggleText.clear();

    requeryElements();
    setupPopupHandlers();
    setupMobileMenuHandlers();
    setupKeyboardHandler();

    state.initialized = true;
  }

  init();

  document.addEventListener('barba:afterTransition', (e) => {
    init();
  });

})();
