/* YouTube Transcript: copiar desde el menú contextual de Inicio.
   Soporta tanto tarjetas y menús legacy como Lockup + Sheet/List ViewModel.
   No requiere APIs internas de YouTube ni altera el menú hasta que el usuario lo abre. */
(() => {
  'use strict';
  const VERSION = '1.7.9';
  if (globalThis.__transcriptHomeMenuLoaded) return;
  globalThis.__transcriptHomeMenuLoaded = true;

  const ACTION = 'extractHomeMenuTranscript';
  const ITEM_CLASS = 'transcript-home-menu-item';
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const CARD_SELECTOR = 'yt-lockup-view-model, ytd-rich-grid-media, ytd-rich-item-renderer';
  const TRIGGER_SELECTOR = [
    'ytd-menu-renderer',
    '.ytLockupMetadataViewModelMenuButton',
    '.yt-lockup-metadata-view-model__menu-button',
    '.yt-lockup-metadata-view-model-wiz__menu-button',
    '.ytLockupMetadataViewModelBottomRight',
    '[class*="LockupMetadataViewModelMenuButton"]'
  ].join(',');
  const LIST_SELECTOR = 'yt-list-view-model, #items, tp-yt-paper-listbox, [role="listbox"]';
  const MAX_CONTEXT_AGE = 12000;
  const es = String(document.documentElement.lang || navigator.language || '').toLowerCase().startsWith('es');
  const locale = es ? {
    label: 'Copiar transcripción', working: 'Obteniendo transcripción…',
    ready: 'Transcripción copiada al portapapeles',
    notFound: 'Este video no tiene subtítulos disponibles o YouTube no permitió extraerlos.',
    failed: 'No se pudo obtener la transcripción.',
    copyFailed: 'Transcripción obtenida, pero no se pudo copiar.',
    retry: 'Copiar ahora', close: 'Cerrar'
  } : {
    label: 'Copy transcript', working: 'Getting transcript…',
    ready: 'Transcript copied to clipboard',
    notFound: 'This video has no available captions, or YouTube blocked retrieval.',
    failed: 'Could not get transcript.',
    copyFailed: 'Transcript retrieved, but copying failed.',
    retry: 'Copy now', close: 'Dismiss'
  };

  let context = null;
  let busy = false;
  let toastTimer = null;
  let toastElement = null;
  let scanQueued = false;
  let scanTimers = [];

  // Diagnóstico no sensible que se puede leer desde la consola de la página.
  document.documentElement.dataset.ytTranscriptMenuVersion = VERSION;
  function mark(state) { document.documentElement.dataset.ytTranscriptMenuState = state; }
  mark('loaded');

  function isHome() {
    return ['www.youtube.com', 'youtube.com'].includes(location.hostname) && location.pathname === '/';
  }
  function idFromHref(href) {
    try {
      const url = new URL(href, location.origin);
      if (!['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) return null;
      const segments = url.pathname.split('/').filter(Boolean);
      const id = url.pathname === '/watch' ? url.searchParams.get('v') :
        (segments[0] === 'live' ? segments[1] : null);  // Solo videos largos en Inicio.
      return VIDEO_ID.test(id || '') ? id : null;
    } catch (_) { return null; }
  }
  function getVideoId(card) {
    // Evitar atribuir a un video el ID de otro dentro de una tarjeta contenedora.
    const anchors = card.querySelectorAll('a[href]');
    const priority = [
      'a#video-title-link[href], a#video-title[href], a.ytLockupMetadataViewModelTitle[href], ' +
      'a.ytLockupViewModelContentImage[href], a#thumbnail[href]',
      'a[href*="/watch?v="], a[href*="/live/"]'
    ];
    for (const selector of priority) {
      for (const a of card.querySelectorAll(selector)) {
        const id = idFromHref(a.getAttribute('href'));
        if (id) return id;
      }
    }
    for (const a of anchors) {
      const id = idFromHref(a.getAttribute('href'));
      if (id) return id;
    }
    // No extraer IDs de miniaturas genéricas o contenido publicitario.
    return null;
  }
  function findCard(target) {
    return target.closest(CARD_SELECTOR);
  }
  function isThreeDots(target, card) {
    const button = target.closest('button, yt-icon-button, [role="button"]');
    if (!button || !card.contains(button)) return false;
    if (button.closest(TRIGGER_SELECTOR)) return true;
    // YouTube puede cambiar el contenedor, pero conservar la etiqueta accesible.
    const label = (button.getAttribute('aria-label') || '').trim().toLowerCase();
    return /^(more actions|action menu|more options|más acciones|más opciones|menú de acciones|menu de acciones)$/.test(label);
  }
  function removeItems() {
    document.querySelectorAll('.' + ITEM_CLASS).forEach(node => node.remove());
  }
  function clearContext() {
    context = null;
    for (const timer of scanTimers) clearTimeout(timer);
    scanTimers = [];
    removeItems();
  }
  function activeContext() {
    return isHome() && context && context.page === location.href &&
      Date.now() - context.time < MAX_CONTEXT_AGE ? context : null;
  }
  function scheduleScans() {
    for (const timer of scanTimers) clearTimeout(timer);
    scanTimers = [];
    queueScan();
    // YouTube suele rellenar el panel con retraso, o reutilizar un menú oculto.
    for (const delay of [40, 120, 280, 600, 1200]) {
      scanTimers.push(setTimeout(() => { if (activeContext()) scanMenus(); }, delay));
    }
  }
  function captureMenuTarget(event) {
    if (!isHome() || !(event.target instanceof Element)) return;
    if (event.target.closest('.' + ITEM_CLASS)) return;
    const card = findCard(event.target);
    if (card && isThreeDots(event.target, card)) {
      const id = getVideoId(card);
      if (!id) { clearContext(); mark('video-id-not-found'); return; }
      if (context && context.id !== id) removeItems();
      context = {id, time: Date.now(), page: location.href};
      mark('video-selected');
      scheduleScans();
      return;
    }
    // Abrir otro menú no debe reutilizar el video anterior.
    if (event.type === 'pointerdown' &&
        !event.target.closest('ytd-popup-container, tp-yt-iron-dropdown, bottom-sheet-container, yt-menu-popup-view-model') &&
        event.target.closest('button, yt-icon-button, [role="button"], ytd-menu-renderer')) {
      clearContext();
    }
  }
  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const ancestor = element.closest('[hidden], [aria-hidden="true"]');
    if (ancestor) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function findLists() {
    const lists = new Set();
    // Punto de entrada más fiable: dropdowns de YouTube, incluidos los del nuevo Sheet.
    const popups = document.querySelectorAll(
      'ytd-popup-container tp-yt-iron-dropdown, ytd-popup-container yt-iron-dropdown, ' +
      'bottom-sheet-container, yt-menu-popup-view-model, .yt-core-popup'
    );
    for (const popup of popups) {
      if (!isVisible(popup)) continue;
      const root = popup.querySelector('ytd-menu-popup-renderer, yt-sheet-view-model, yt-menu-popup-view-model') || popup;
      if (!isVisible(root)) continue;
      const list = root.querySelector(LIST_SELECTOR) || (root.matches(LIST_SELECTOR) ? root : null);
      if (list && isVisible(list)) lists.add(list);
    }
    // Compatibilidad con menús legacy que YouTube renderiza fuera del dropdown.
    for (const root of document.querySelectorAll('ytd-menu-popup-renderer')) {
      if (!isVisible(root)) continue;
      const list = root.querySelector('#items, tp-yt-paper-listbox, [role="listbox"]') || root;
      if (isVisible(list)) lists.add(list);
    }
    return [...lists];
  }
  function dismissMenu(item) {
    const dropdown = item.closest('tp-yt-iron-dropdown, yt-iron-dropdown, iron-dropdown');
    try { if (typeof dropdown?.close === 'function') { dropdown.close(); return; } } catch (_) {}
    const container = item.closest('ytd-popup-container') || document.querySelector('ytd-popup-container');
    try { if (typeof container?.hidePopup === 'function') { container.hidePopup(); return; } } catch (_) {}
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', code:'Escape', bubbles:true}));
  }
  function makeMenuItem() {
    const item = document.createElement('div');
    item.className = ITEM_CLASS;
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', locale.label);

    const icon = document.createElement('span');
    icon.className = 'transcript-home-menu-icon';
    icon.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, val] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor',
      'stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round'})) svg.setAttribute(key, val);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    for (const [key, val] of Object.entries({x:'4',y:'3',width:'16',height:'18',rx:'2'})) rect.setAttribute(key, val);
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M8 8h8M8 12h8M8 16h5');
    svg.append(rect,path); icon.append(svg);
    const label = document.createElement('span');
    label.textContent = locale.label;
    item.append(icon,label);

    item.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const selected = activeContext();
      if (!selected) { mark('selection-expired'); clearContext(); return; }
      dismissMenu(item);
      clearContext();
      mark('extracting');
      void runCopy(selected.id);
    });
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopImmediatePropagation(); item.click();
      }
    });
    return item;
  }
  function scanMenus() {
    if (!activeContext()) return;
    const lists = findLists();
    if (!lists.length) { mark('waiting-for-popup'); return; }
    for (const list of lists) {
      if (list.querySelector('.' + ITEM_CLASS)) continue;
      list.prepend(makeMenuItem());
      mark('option-inserted');
      // Hay menús a los que YouTube aplica medidas antes de añadir nuevos ítems.
      const dd = list.closest('tp-yt-iron-dropdown');
      try { if (typeof dd?.refit === 'function') requestAnimationFrame(() => { if (isVisible(dd)) dd.refit(); }); } catch (_) {}
    }
  }
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; scanMenus(); });
  }
  function toast(message, status = 'info', retryText = '') {
    if (toastTimer) {clearTimeout(toastTimer); toastTimer = null;}
    toastElement?.remove();
    const el = document.createElement('div');
    el.className = 'transcript-home-toast';
    el.setAttribute('role','status');
    el.setAttribute('aria-live', status === 'error' ? 'assertive' : 'polite');
    el.dataset.state = status;
    const text = document.createElement('span'); text.textContent = message; el.append(text);
    if (retryText) {
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = locale.retry;
      retry.addEventListener('click', () => {void writeClipboard(retryText);});
      el.append(retry);
    }
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'transcript-home-toast-close';
    close.textContent = '×'; close.setAttribute('aria-label', locale.close);
    close.addEventListener('click', () => {el.remove(); if (toastElement === el) toastElement = null;});
    el.append(close);
    (document.body || document.documentElement).append(el);
    toastElement = el;
    if (status !== 'busy' && !retryText) {
      toastTimer = setTimeout(() => {if (toastElement === el) {el.remove(); toastElement = null;}}, 5200);
    }
  }
  async function writeClipboard(text) {
    try {
      await globalThis.TranscriptClipboard.writeText(text);
      mark('copied');
      toast(locale.ready,'success');
    } catch (_) {
      mark('clipboard-blocked');
      toast(locale.copyFailed,'error',text);
    }
  }
  async function runCopy(id) {
    if (busy) return;
    busy = true;
    toast(locale.working,'busy');
    try {
      const result = await chrome.runtime.sendMessage({action:ACTION,videoId:id});
      if (!result?.success || !String(result.transcript || '').trim()) {
        throw new Error(String(result?.error || locale.notFound).slice(0,280));
      }
      await writeClipboard(result.transcript.trim());
    } catch (error) {
      const text = String(error?.message || '');
      mark('extract-failed');
      const invalidated = /Extension context invalidated|Receiving end does not exist/i.test(text);
      toast(invalidated ? (es ? 'Recarga YouTube y vuelve a intentarlo.' : 'Refresh YouTube and try again.') :
        (text || locale.failed),'error');
    } finally {busy = false;}
  }

  document.addEventListener('pointerdown', captureMenuTarget, true);
  document.addEventListener('click', captureMenuTarget, true);
  new MutationObserver(mutations => {
    if (!activeContext()) return;
    if (mutations.some(m => m.type === 'childList' ||
        ['hidden','style','aria-hidden'].includes(m.attributeName))) queueScan();
  }).observe(document.documentElement, {
    subtree:true,childList:true,attributes:true,attributeFilter:['hidden','style','aria-hidden']
  });
  window.addEventListener('yt-navigate-start', () => {clearContext(); mark('navigation');});
  window.addEventListener('yt-navigate-finish', () => {clearContext(); mark('loaded');});
})();
