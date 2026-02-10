(function () {
  'use strict';

  const CONFIG = {
    duration: 1.5,
    ease: 'power4',
    dragMultiplier: 2,
    columns: 5,
    minImages: 15,
    entranceDelay: 0.2,
    entranceDuration: 0.6,
    entranceStagger: 0.05
  };

  const state = {
    initialized: false,
    populated: false,
    observer: null,
    xTo: null,
    yTo: null,
    incrX: 0,
    incrY: 0,
    watcherInitialized: false
  };

  let elements = {
    popup: null,
    container: null,
    source: null
  };

  function requeryElements() {
    elements.popup = document.querySelector('[data-popup-target="bts"]');
    elements.container = document.querySelector('[data-bts="container"]');
    elements.source = document.querySelector('[data-bts="source"]');

    state.initialized = false;
    state.populated = false;
    state.incrX = 0;
    state.incrY = 0;

    if (state.observer) {
      state.observer.kill();
      state.observer = null;
    }

    state.xTo = null;
    state.yTo = null;

    if (elements.container) {
      elements.container.innerHTML = '';
    }
  }

  function getSourceImages() {
    if (!elements.source) return [];

    const images = elements.source.querySelectorAll(
      '[data-bts-source="image"]:not(.w-condition-invisible)');
    return Array.from(images);
  }

  function populateGrid() {
    if (state.populated) return;
    if (!elements.container) return;

    const sourceImages = getSourceImages();

    if (sourceImages.length === 0) return;

    const minImages = CONFIG.minImages;
    const columns = CONFIG.columns;

    let imagesToUse = [...sourceImages];

    while (imagesToUse.length < minImages || imagesToUse.length % columns !== 0) {
      for (let i = 0; i < sourceImages.length; i++) {
        imagesToUse.push(sourceImages[i]);

        if (imagesToUse.length >= minImages && imagesToUse.length % columns === 0) {
          break;
        }
      }
    }

    const content = document.createElement('div');
    content.className = 'bts_content';

    imagesToUse.forEach(img => {
      const media = document.createElement('div');
      media.className = 'bts_media';

      const clonedImg = img.cloneNode(true);
      clonedImg.removeAttribute('data-bts-source');
      clonedImg.loading = 'eager';

      media.appendChild(clonedImg);
      content.appendChild(media);
    });

    elements.container.innerHTML = '';
    elements.container.appendChild(content);

    for (let i = 0; i < 3; i++) {
      const clone = content.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      elements.container.appendChild(clone);
    }

    state.populated = true;
  }

  function initGrid() {
    if (state.initialized) return;

    if (!state.populated) {
      populateGrid();
    }

    if (!elements.container || !state.populated) return;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const halfX = elements.container.clientWidth / 2;
    const halfY = elements.container.clientHeight / 2;

    const wrapX = gsap.utils.wrap(-halfX, 0);
    const wrapY = gsap.utils.wrap(-halfY, 0);

    state.xTo = gsap.quickTo(elements.container, 'x', {
      duration: CONFIG.duration,
      ease: CONFIG.ease,
      modifiers: {
        x: gsap.utils.unitize(wrapX)
      }
    });

    state.yTo = gsap.quickTo(elements.container, 'y', {
      duration: CONFIG.duration,
      ease: CONFIG.ease,
      modifiers: {
        y: gsap.utils.unitize(wrapY)
      }
    });

    state.incrX = 0;
    state.incrY = 0;

    state.observer = Observer.create({
      target: elements.popup,
      type: 'wheel,touch,pointer',
      preventDefault: true,
      onChangeX: (self) => {
        if (self.event.type === 'wheel') {
          state.incrX -= self.deltaX;
        } else {
          state.incrX += self.deltaX * CONFIG.dragMultiplier;
        }
        state.xTo(state.incrX);
      },
      onChangeY: (self) => {
        if (self.event.type === 'wheel') {
          state.incrY -= self.deltaY;
        } else {
          state.incrY += self.deltaY * CONFIG.dragMultiplier;
        }
        state.yTo(state.incrY);
      }
    });

    state.initialized = true;

    animateEntrance();
  }

  function animateEntrance() {
    const mediaItems = elements.container.querySelectorAll('.bts_content:first-child .bts_media');

    gsap.set(mediaItems, {
      opacity: 0,
      scale: 0.8
    });

    gsap.to(mediaItems, {
      opacity: 1,
      scale: 1,
      duration: CONFIG.entranceDuration,
      ease: 'power2.out',
      stagger: {
        each: CONFIG.entranceStagger,
        from: 'random'
      },
      delay: CONFIG.entranceDelay
    });

    const duplicates = elements.container.querySelectorAll('.bts_content:not(:first-child)');
    gsap.set(duplicates, { opacity: 0 });
    gsap.to(duplicates, {
      opacity: 1,
      duration: CONFIG.entranceDuration,
      delay: CONFIG.entranceDelay + 0.3
    });
  }

  function destroyGrid() {
    if (!state.initialized) return;

    document.body.style.overflow = '';
    document.body.style.touchAction = '';

    if (state.observer) {
      state.observer.kill();
      state.observer = null;
    }

    if (elements.container) {
      gsap.killTweensOf(elements.container.querySelectorAll('.bts_media'));
      gsap.killTweensOf(elements.container.querySelectorAll('.bts_content'));
      gsap.set(elements.container, { x: 0, y: 0 });
    }

    state.xTo = null;
    state.yTo = null;
    state.incrX = 0;
    state.incrY = 0;
    state.initialized = false;
  }

  function setupPopupWatcher() {
    if (!elements.popup) return;

    if (state.watcherInitialized) return;

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isActive = elements.popup.classList.contains('is-active');

          if (isActive && !state.initialized) {
            setTimeout(initGrid, 50);
          } else if (!isActive && state.initialized) {
            destroyGrid();
          }
        }
      });
    });

    mutationObserver.observe(elements.popup, {
      attributes: true,
      attributeFilter: ['class']
    });

    state.watcherInitialized = true;
  }

  window.btsGrid = {
    init: initGrid,
    destroy: destroyGrid,
    populate: populateGrid,
    getSourceImages,
    state,
    elements
  };

  function init() {
    setupPopupWatcher();
  }

  requeryElements();

  init();

  document.addEventListener('barba:afterTransition', (e) => {
    if (state.initialized) {
      destroyGrid();
    }

    state.watcherInitialized = false;

    requeryElements();
    init();
  });

})();
