(function () {
  'use strict';

  const CONFIG = {
    fadeOutDuration: 0.25,
    fadeInDuration: 0.5,
    fadeInStagger: 0.08,
    gapBetweenTransitions: 0.1,
    ease: 'power2.out',
    imageGap: '1rem'
  };

  const state = {
    currentProject: null,
    observer: null,
    initialized: false,
    currentTween: null
  };

  let elements = {
    awardColumn: null,
    projectItems: null
  };

  function requeryElements() {
    elements.awardColumn = document.querySelector('[data-award-image="column"]');
    elements.projectItems = document.querySelectorAll('[data-project="item"]');

    state.currentProject = null;

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    killCurrentAnimation();

    if (elements.awardColumn) {
      elements.awardColumn.innerHTML = '';
    }
  }

  function getAwardImages(projectItem) {
    if (!projectItem) return [];

    const awardWrap = projectItem.querySelector('[data-award-image="wrap"]');
    if (!awardWrap) return [];

    const images = awardWrap.querySelectorAll(
      '[data-award-image="src"]:not(.w-condition-invisible)');

    return Array.from(images).filter(img => {
      const src = img.getAttribute('src');
      return src &&
        !src.includes('placeholder.60f9b1840c.svg') &&
        src.trim() !== '';
    });
  }

  function createAwardImage(src, index) {
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-awrd-image', 'div');
    wrapper.className = 'award_icon_inner';

    const img = document.createElement('img');
    img.setAttribute('data-award-image', 'target');
    img.className = 'award_icon_image';
    img.src = src;
    img.loading = 'lazy';
    img.alt = '';

    wrapper.appendChild(img);

    return wrapper;
  }

  function killCurrentAnimation() {
    if (state.currentTween) {
      state.currentTween.kill();
      state.currentTween = null;
    }
    gsap.killTweensOf('[data-award-image="target"]');
    gsap.killTweensOf('[data-awrd-image="div"]');
  }

  function fadeOutImages() {
    return new Promise((resolve) => {
      const currentWrappers = elements.awardColumn.querySelectorAll(
        '[data-awrd-image="div"]');

      if (currentWrappers.length === 0) {
        resolve();
        return;
      }

      const images = elements.awardColumn.querySelectorAll('[data-award-image="target"]');

      state.currentTween = gsap.to(images, {
        opacity: 0,
        duration: CONFIG.fadeOutDuration,
        ease: 'power2.in',
        onComplete: () => {
          currentWrappers.forEach(wrapper => wrapper.remove());
          resolve();
        }
      });
    });
  }

  function fadeInImages(wrappers) {
    wrappers.forEach((wrapper) => {
      elements.awardColumn.appendChild(wrapper);
    });

    void elements.awardColumn.offsetWidth;

    const images = wrappers.map(w => w.querySelector('[data-award-image="target"]'));

    gsap.set(images, {
      opacity: 0
    });

    state.currentTween = gsap.to(images, {
      opacity: 1,
      duration: CONFIG.fadeInDuration,
      stagger: CONFIG.fadeInStagger,
      ease: CONFIG.ease
    });
  }

  async function updateAwards(projectItem) {
    if (state.currentProject === projectItem) return;

    killCurrentAnimation();

    state.currentProject = projectItem;

    const awardSources = getAwardImages(projectItem);

    await fadeOutImages();

    await new Promise(resolve => setTimeout(resolve, CONFIG.gapBetweenTransitions * 1000));

    if (state.currentProject !== projectItem) return;

    if (awardSources.length === 0) {
      return;
    }

    const newWrappers = awardSources.map((img, index) => {
      return createAwardImage(img.src, index);
    });

    fadeInImages(newWrappers);
  }

  function setupMutationObserver() {
    if (state.observer) {
      state.observer.disconnect();
    }

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' &&
          (mutation.attributeName === 'class')) {

          const target = mutation.target;

          if (target.classList.contains('is-active') ||
            target.classList.contains('u-is-active')) {
            updateAwards(target);
          }
        }
      });
    });

    elements.projectItems.forEach(item => {
      observer.observe(item, {
        attributes: true,
        attributeFilter: ['class']
      });
    });

    state.observer = observer;
  }

  function initializeAwards() {
    const activeProject = document.querySelector(
      '[data-project="item"].is-active, [data-project="item"].u-is-active');

    if (activeProject) {
      const awardSources = getAwardImages(activeProject);

      if (awardSources.length > 0) {
        state.currentProject = activeProject;

        const wrappers = awardSources.map((img, index) => {
          return createAwardImage(img.src, index);
        });

        wrappers.forEach(wrapper => {
          elements.awardColumn.appendChild(wrapper);
        });

        const images = wrappers.map(w => w.querySelector('[data-award-image="target"]'));

        gsap.set(images, {
          opacity: 0
        });

        gsap.to(images, {
          opacity: 1,
          duration: CONFIG.fadeInDuration,
          stagger: CONFIG.fadeInStagger,
          ease: CONFIG.ease,
          delay: 0.2
        });
      }
    }
  }

  window.awardIconManager = {
    updateAwards,
    getAwardImages,
    killCurrentAnimation,
    state,
    CONFIG
  };

  function init() {
    if (state.initialized) return;

    if (!elements.awardColumn) return;

    initializeAwards();
    setupMutationObserver();

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
