/* Small, dependency-free faculty carousel. No duplicate strips or animation loop. */
window.K5Faculty = function ({ track, people, render, mobile, reducedMotion, language, state }) {
  const viewport = track.closest('.faculty-marquee');
  const controls = viewport.querySelector('.faculty-controls') || viewport.nextElementSibling;
  viewport.after(controls);
  const previous = controls.querySelector('[data-faculty-prev]');
  const next = controls.querySelector('[data-faculty-next]');
  const count = controls.querySelector('.faculty-count');
  let toggle = controls.querySelector('[data-faculty-toggle]');
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'faculty-toggle';
    toggle.dataset.facultyToggle = '';
    controls.append(toggle);
  }
  let timer, scrollTimer, sequence = 0, disposed = false, inView = !('IntersectionObserver' in window);
  let requestedIndex = state.index;
  let pointer = null, hovering = false, focused = false;
  const cleanups = [], pending = new Map();
  const wrap = value => (value + people.length) % people.length;
  const listen = (target, name, handler, options) => {
    target.addEventListener(name, handler, options);
    cleanups.push(() => target.removeEventListener(name, handler, options));
  };
  const imageReady = index => {
    const source = people[wrap(index)][1];
    if (pending.has(source)) return pending.get(source);
    const task = new Promise((resolve, reject) => {
      const image = new Image();
      let deadline = setTimeout(() => finish(false), 12000);
      const finish = success => {
        clearTimeout(deadline);
        image.onload = image.onerror = null;
        if (!success) { pending.delete(source); reject(new Error('Image unavailable')); return; }
        if (image.decode) image.decode().catch(() => {}).then(resolve); else resolve();
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = source;
    });
    pending.set(source, task);
    return task;
  };
  const warmNext = () => {
    if (mobile && inView && !document.hidden && !navigator.connection?.saveData) imageReady(state.index + 1).catch(() => {});
  };
  const updateControls = (manual = false) => {
    const en = language === 'en';
    count.setAttribute('aria-live', manual ? 'polite' : 'off');
    count.textContent = `${String(state.index + 1).padStart(2, '0')} / ${people.length}`;
    previous.setAttribute('aria-label', en ? 'Previous teacher' : '上一位老师');
    next.setAttribute('aria-label', en ? 'Next teacher' : '下一位老师');
    toggle.textContent = reducedMotion.matches ? (en ? 'Manual' : '手动浏览') : state.paused ? (en ? 'Play' : '继续播放') : (en ? 'Pause' : '暂停播放');
    toggle.disabled = reducedMotion.matches;
    toggle.setAttribute('aria-pressed', String(state.paused));
  };
  const schedule = (delay = 5000) => {
    clearTimeout(timer);
    if (disposed || !inView || document.hidden || state.paused || reducedMotion.matches || pointer || hovering || focused) return;
    timer = setTimeout(() => move(1, false), delay);
  };
  const showMobile = async (target, manual) => {
    const request = ++sequence;
    try {
      await imageReady(target);
      if (disposed || request !== sequence) return;
      state.index = target;
      requestedIndex = target;
      track.innerHTML = render([people[target]]);
      track.querySelector('img').loading = 'eager';
      updateControls(manual);
      warmNext();
    } catch (_) {
      if (!disposed && request === sequence) {
        requestedIndex = state.index;
        count.setAttribute('aria-live', 'polite');
        count.textContent = language === 'en' ? 'Retry →' : '请重试 →';
      }
    } finally { if (!disposed && request === sequence) schedule(manual ? 8000 : 5000); }
  };
  const move = (direction, manual = true) => {
    clearTimeout(timer);
    if (mobile) {
      requestedIndex = wrap(requestedIndex + direction);
      showMobile(requestedIndex, manual);
      return;
    }
    const items = [...track.querySelectorAll('.teacher-card')];
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const step = items[1] ? items[1].offsetLeft - items[0].offsetLeft : viewport.clientWidth;
    const left = direction > 0
      ? (viewport.scrollLeft >= max - 2 ? 0 : Math.min(max, viewport.scrollLeft + step))
      : (viewport.scrollLeft <= 2 ? max : Math.max(0, viewport.scrollLeft - step));
    viewport.scrollTo({ left, behavior: reducedMotion.matches || !manual ? 'auto' : 'smooth' });
    schedule(manual ? 8000 : 5000);
  };
  track.innerHTML = render(mobile ? [people[state.index]] : people);
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', track.getAttribute('aria-label'));
  updateControls();
  if (!mobile) {
    const items = track.querySelectorAll('.teacher-card');
    viewport.scrollLeft = items[state.index].offsetLeft - items[0].offsetLeft;
    listen(viewport, 'scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const cards = [...track.querySelectorAll('.teacher-card')];
        const base = cards[0].offsetLeft;
        state.index = cards.reduce((best, card, index) => Math.abs(card.offsetLeft - base - viewport.scrollLeft) < Math.abs(cards[best].offsetLeft - base - viewport.scrollLeft) ? index : best, 0);
        updateControls();
        schedule(8000);
      }, 120);
    }, { passive: true });
  }
  listen(previous, 'click', () => move(-1));
  listen(next, 'click', () => move(1));
  listen(toggle, 'click', () => { state.paused = !state.paused; updateControls(); schedule(); });
  listen(viewport, 'keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(event.key === 'ArrowRight' ? 1 : -1);
  });
  listen(viewport, 'pointerdown', event => {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    clearTimeout(timer);
    if (mobile) viewport.setPointerCapture?.(event.pointerId);
  });
  const release = event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    pointer = null;
    if (event.type === 'pointerup' && mobile && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) move(dx < 0 ? 1 : -1);
    else schedule(8000);
  };
  listen(window, 'pointerup', release, { passive: true });
  listen(window, 'pointercancel', release, { passive: true });
  listen(viewport, 'dragstart', event => event.preventDefault());
  listen(viewport, 'mouseenter', () => { if (!mobile) { hovering = true; schedule(); } });
  listen(viewport, 'mouseleave', () => { hovering = false; schedule(); });
  listen(viewport, 'focusin', () => { focused = viewport.matches(':focus-visible'); schedule(); });
  listen(viewport, 'focusout', () => { focused = false; schedule(); });
  listen(document, 'visibilitychange', () => { schedule(); warmNext(); });
  listen(window, 'pagehide', () => clearTimeout(timer));
  listen(window, 'pageshow', () => schedule());
  listen(reducedMotion, 'change', () => { updateControls(); schedule(); });
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting && entries[0].intersectionRatio >= .1;
    schedule(); warmNext();
  }, { threshold: [0, .1] }) : null;
  observer?.observe(viewport);
  schedule();
  return () => {
    disposed = true; sequence++;
    clearTimeout(timer); clearTimeout(scrollTimer);
    observer?.disconnect(); cleanups.forEach(cleanup => cleanup());
  };
};
