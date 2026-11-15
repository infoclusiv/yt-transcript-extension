/* Fallback: let YouTube's own channel UI load additional cards while scrolling.
   This does not call private browse endpoints or attempt to evade a denied request. */
(function (root) {
  'use strict';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sections = new Set(['videos','shorts','streams']);

  async function waitForTab(tabId, timeout = 45000) {
    let tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await new Promise((resolve, reject) => {
      let done = false;
      const finish = err => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdate);
        chrome.tabs.onRemoved.removeListener(onRemove);
        err ? reject(err) : resolve();
      };
      const onUpdate = (id, info) => { if (id === tabId && info.status === 'complete') finish(); };
      const onRemove = id => { if (id === tabId) finish(new Error('Se cerró la pestaña de exploración.')); };
      const timer = setTimeout(() => finish(new Error('La página del canal no terminó de cargar.')), timeout);
      chrome.tabs.onUpdated.addListener(onUpdate);
      chrome.tabs.onRemoved.addListener(onRemove);
      chrome.tabs.get(tabId).then(t => { if (t.status === 'complete') finish(); }).catch(finish);
    });
  }

  /* Chrome executes this function in the actual YouTube tab, where lazy-loaded cards
     are naturally obtained by the website. No request interception or cookie access. */
  function readAndScroll(section) {
    const url = location.href;
    const all = [];
    const cardSelectors = [
      'ytd-rich-grid-renderer ytd-rich-item-renderer',
      'ytd-grid-renderer ytd-grid-video-renderer',
      'ytd-section-list-renderer ytd-rich-item-renderer',
      'ytd-rich-grid-renderer yt-lockup-view-model',
      'ytd-section-list-renderer yt-lockup-view-model',
      'ytd-reel-item-renderer'
    ];
    let cards = document.querySelectorAll(cardSelectors.join(','));
    // Do not include video suggestions from unrelated channel/sidebar areas.
    if (!cards.length) cards = document.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer');
    const used = new Set();
    for (const card of cards) {
      const a = card.querySelector(section === 'shorts'
        ? 'a[href*="/shorts/"]'
        : 'a[href*="/watch?v="], a[href*="/shorts/"]');
      if (!a) continue;
      let link;
      try { link = new URL(a.getAttribute('href'), location.origin); } catch { continue; }
      if (!['www.youtube.com','youtube.com','m.youtube.com'].includes(link.hostname)) continue;
      const id = link.pathname.startsWith('/shorts/') ? link.pathname.split('/')[2] : link.searchParams.get('v');
      if (!/^[\w-]{11}$/.test(id || '') || used.has(id)) continue;
      used.add(id);
      const titleEl = card.querySelector('#video-title, #video-title-link, h3, .yt-lockup-metadata-view-model__title, yt-formatted-string');
      const rawTitle = titleEl?.getAttribute('title') || titleEl?.getAttribute('aria-label') ||
        titleEl?.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || a.textContent || '';
      all.push({videoId:id,title:rawTitle.trim().replace(/\s+/g,' ').slice(0,500) || `Video ${id}`,
        section,url: section === 'shorts' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`});
    }
    const main = document.scrollingElement || document.documentElement;
    const beforeHeight = main.scrollHeight;
    const beforeTop = main.scrollTop;
    const viewport = main.clientHeight || innerHeight;
    // Scrolling the real page is the fallback when an internal API is unavailable.
    // Try the continuation element before scrolling the root container: YouTube
    // can use its own scroll observer for this element.
    const continuations=[...document.querySelectorAll('ytd-continuation-item-renderer, #continuations ytd-continuation-item-renderer')];
    const continuationVisible=continuations.some(el=>typeof el.getClientRects==='function' && el.getClientRects().length>0);
    if(continuationVisible)continuations[continuations.length-1].scrollIntoView({block:'end'});
    else main.scrollTo(0,beforeHeight);
    return {
      videos:all, pageUrl:url, pageTitle:document.title,
      beforeHeight, beforeTop, afterTop:main.scrollTop, viewport,
      atBottom: main.scrollTop + viewport >= beforeHeight - 100,
      hasContinuation:continuationVisible,
      bodyText:all.length ? '' : (document.body?.innerText || '').slice(0,600)
    };
  }

  async function discoverSection(channelUrl, section, checkpoint, onPage, shouldStop, onStatus) {
    if (!sections.has(section)) throw new Error('Sección no válida para el recorrido visual.');
    const sectionUrl = `${channelUrl}/${section}`;
    // Lazy loading can stall in a background tab. Use the normal active browser tab
    // during discovery and close it as soon as this section finishes.
    const tab = await chrome.tabs.create({url:sectionUrl, active:true});
    const tabId = tab.id;
    let rounds = 0, stable = 0, known = new Set(), lastHeight = 0, lastCount = -1;
    let completed = false, continuationStalled = false;
    try {
      await waitForTab(tabId);
      await sleep(1700);
      // 1,500 rounds is a guardrail, not proof of having listed the whole channel.
      for (; rounds < 1500 && !shouldStop(); rounds++) {
        const results = await chrome.scripting.executeScript({target:{tabId},func:readAndScroll,args:[section]});
        const data = results?.[0]?.result;
        if (!data || !data.pageUrl?.includes('youtube.com'))
          throw new Error('No se pudo leer la página del canal en la pestaña de YouTube.');
        const url = new URL(data.pageUrl);
        if (!url.pathname.startsWith(new URL(channelUrl).pathname))
          throw new Error(`YouTube redirigió la exploración a otra página (${url.pathname}).`);
        const added = [];
        for (const v of data.videos || []) if (!known.has(v.videoId)) {known.add(v.videoId);added.push(v);}
        if (rounds === 0 && !known.size && /consent|verify|captcha|sign in|iniciar sesión|unusual traffic/i.test(data.pageTitle+' '+data.bodyText))
          throw new Error('YouTube solicita verificación o consentimiento en la página del canal.');
        if (added.length) await onPage(added,{pages:rounds+1,nextToken:null,finished:false,method:'browser-scroll'});
        const noChanges = data.atBottom && !added.length && known.size === lastCount && data.beforeHeight === lastHeight;
        stable = noChanges ? stable+1 : 0;
        lastCount = known.size;lastHeight = data.beforeHeight;
        onStatus?.(`Recorriendo la página de ${section} · ${known.size} videos visibles recopilados`);
        if (stable >= 6 && rounds >= 8) {
          if(data.hasContinuation){
            continuationStalled=true;
            break;
          }
          // The API checkpoint proves that more than the last group exists.
          // Never mark the list as complete if the visual fallback has only
          // reproduced the same initial group and has not advanced.
          if(checkpoint?.nextToken && known.size <= (checkpoint.lastPageSize||32)){
            continuationStalled=true;
            break;
          }
          completed=true;
          break;
        }
        await sleep(1100 + (rounds % 4)*180);
      }
      if (!completed) {
        if (shouldStop()) return {finished:false, count:known.size, interrupted:true};
        if(continuationStalled)
          throw new Error('La página de YouTube no cargó el siguiente grupo. El catálogo sigue incompleto; no se marcó como finalizado.');
        throw new Error('Se alcanzó el límite de exploración visual; lista posiblemente incompleta.');
      }
      if (!known.size && /videos|shorts|streams/.test(section))
        throw new Error(`No se detectaron publicaciones en la sección ${section}. Comprueba si carga normalmente en YouTube.`);
      await onPage([],{pages:rounds+1,nextToken:null,finished:true,method:'browser-scroll'});
      return {finished:true,count:known.size};
    } finally {
      try { await chrome.tabs.remove(tabId); } catch {}
    }
  }

  root.ChannelBatchDomDiscovery = {discoverSection};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChannelBatchDomDiscovery;
})(typeof globalThis !== 'undefined' ? globalThis : this);
