/* Aislado del motor de transcripciones: lectura visual de la pestaña Videos. */
(() => {
  'use strict';
  if (window.__YTCL_SCANNER_V1__) return;
  window.__YTCL_SCANNER_V1__ = true;

  let running = false;
  let cancelled = false;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const validId = id => /^[A-Za-z0-9_-]{11}$/.test(id || '');

  function channelInfo() {
    const path = location.pathname.replace(/\/+$/, '');
    const match = path.match(/^\/(@[^/]+|channel\/UC[A-Za-z0-9_-]+|c\/[^/]+|user\/[^/]+)\/videos$/);
    return match ? {key: 'https://www.youtube.com/' + match[1],
      url: location.href, title: document.title} : null;
  }

  function ageInDays(value) {
    const original = clean(value);
    if (!original) return null;
    const s = original.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(today|hoy|hoje|aujourd'hui)\b/.test(s)) return 0;
    if (/\b(yesterday|ayer|ontem|hier|gestern)\b/.test(s)) return 1;
    let m = s.match(/(\d+)\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago/);
    if (!m) m = s.match(/hace\s+(?:aproximadamente\s+)?(\d+)\s*(segundos?|minutos?|horas?|dias?|semanas?|meses?|anos?)/);
    if (!m) m = s.match(/ha\s+(\d+)\s*(segundos?|minutos?|horas?|dias?|semanas?|meses?|anos?)/);
    if (!m) m = s.match(/il\s+y\s+a\s+(\d+)\s*(jours?|semaines?|mois|annees?|ans?)/);
    if (!m) m = s.match(/vor\s+(\d+)\s*(sekunden?|minuten?|stunden?|tagen?|tage|wochen?|monaten?|monate|jahren?|jahre)/);
    if (!m) return null;
    const unit = m[2];
    let factor = null;
    if (/^(second|minute|hour|segund|minut|hor|sekund|stund)/.test(unit)) factor = 0;
    else if (/^(day|dia|jour|tag)/.test(unit)) factor = 1;
    else if (/^(week|seman|woch)/.test(unit)) factor = 7;
    else if (/^(month|mes|moi|monat)/.test(unit)) factor = 30.4375;
    else if (/^(year|ano|ann|ans|jahr)/.test(unit)) factor = 365;
    return factor === null ? null : Number(m[1]) * factor;
  }

  function published(card) {
    const data = card.data || card.__data;
    const fromData = data && (data.publishedTimeText || data.content?.videoRenderer?.publishedTimeText);
    if (fromData) {
      const raw = typeof fromData === 'string' ? fromData :
        fromData.simpleText || (fromData.runs || []).map(item => item.text || '').join('');
      if (ageInDays(raw) !== null) return clean(raw);
    }
    const nodes = card.querySelectorAll('#metadata-line span, .inline-metadata-item, yt-content-metadata-view-model span, [aria-label]');
    for (const el of nodes) {
      const candidates = [el.textContent, el.getAttribute('aria-label')];
      for (const value of candidates) {
        if (ageInDays(value) !== null) return clean(value).slice(0,150);
      }
    }
    return '';
  }

  function collectVisible() {
    const videos = new Map();
    const cards = document.querySelectorAll([
      'ytd-browse ytd-rich-item-renderer',
      'ytd-browse ytd-grid-video-renderer',
      'ytd-browse ytd-video-renderer',
      'ytd-browse yt-lockup-view-model'
    ].join(','));
    for (const card of cards) {
      const anchor = card.querySelector('a[href*="/watch?v="]');
      if (!anchor) continue;
      let url;
      try { url = new URL(anchor.getAttribute('href'), location.origin); } catch { continue; }
      if (!['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname) || url.pathname !== '/watch') continue;
      const id = url.searchParams.get('v');
      if (!validId(id)) continue;
      const titleEl = card.querySelector('#video-title, #video-title-link, h3, .yt-lockup-metadata-view-model__title');
      const title = clean(titleEl?.getAttribute('title') || titleEl?.textContent ||
        anchor.getAttribute('title') || anchor.getAttribute('aria-label') || anchor.textContent) || ('Video ' + id);
      const dateText = published(card);
      const record = {videoId:id, url:'https://www.youtube.com/watch?v=' + id,
        title:title.slice(0,500), dateText:dateText || 'Fecha no detectada',
        ageDays:ageInDays(dateText), observedAt:Date.now()};
      const previous = videos.get(id);
      if (!previous || (previous.ageDays === null && record.ageDays !== null)) videos.set(id, record);
    }
    return Array.from(videos.values());
  }

  async function scanAll(options) {
    if (running) return {ok:false, error:'Ya se está recopilando este canal.'};
    const initial = channelInfo();
    if (!initial) return {ok:false, error:'Abre la pestaña Videos de un canal de YouTube.'};
    running = true;
    cancelled = false;
    const maxVideos = Math.max(0, Math.floor(Number(options?.maxVideos) || 0));
    const delay = Math.max(500, Math.min(3000, Number(options?.delayMs) || 1100));
    const originalScroll = window.scrollY;
    const accumulated = new Map();
    let stable = 0, lastHeight = -1, lastSize = -1, rounds = 0;
    let completed = false, truncated = false, stalled = false;
    try {
      for (; rounds < 1200 && !cancelled; rounds++) {
        if (channelInfo()?.key !== initial.key) throw new Error('Cambió la página durante el escaneo.');
        for (const item of collectVisible()) {
          const before = accumulated.get(item.videoId);
          if (!before) accumulated.set(item.videoId, item);
          else if (before.ageDays === null && item.ageDays !== null) {
            accumulated.set(item.videoId, {...before, ageDays:item.ageDays, dateText:item.dateText});
          }
        }
        const count = accumulated.size;
        const root = document.scrollingElement || document.documentElement;
        const height = root.scrollHeight;
        const viewport = root.clientHeight || window.innerHeight;
        const bottom = root.scrollTop + viewport >= height - 120;
        const continuation = Array.from(document.querySelectorAll('ytd-continuation-item-renderer'))
          .some(node => node.getClientRects().length > 0);
        chrome.runtime.sendMessage({type:'YTCL_PROGRESS', channelKey:initial.key,
          count, rounds:rounds+1, stable}).catch(() => {});
        if (maxVideos && count >= maxVideos) {truncated = true; break;}
        stable = bottom && count === lastSize && height === lastHeight ? stable + 1 : 0;
        if (stable >= 8 && rounds >= 8) {
          if (continuation) stalled = true;
          else completed = true;
          break;
        }
        lastSize = count;
        lastHeight = height;
        if (continuation) {
          const nodes = document.querySelectorAll('ytd-continuation-item-renderer');
          nodes[nodes.length-1]?.scrollIntoView({block:'end'});
        } else {
          window.scrollTo({top:height,behavior:'instant'});
        }
        await wait(delay);
      }
      for (const item of collectVisible()) {
        if (!accumulated.has(item.videoId)) accumulated.set(item.videoId,item);
      }
      let videos = Array.from(accumulated.values());
      if (maxVideos) videos = videos.slice(0,maxVideos);
      return {ok:true, videos, page:initial, cancelled, completed,
        truncated, stalled, rounds};
    } catch (error) {
      return {ok:false,error:String(error?.message||error), videos:Array.from(accumulated.values()), page:initial};
    } finally {
      if (options?.restoreScroll !== false && channelInfo()?.key === initial.key) {
        window.scrollTo({top:originalScroll,behavior:'instant'});
      }
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'YTCL_VISIBLE') {
      const page = channelInfo();
      respond(page ? {ok:true,page,videos:collectVisible()} :
        {ok:false,error:'Selecciona la pestaña Videos del canal.'});
      return;
    }
    if (message.type === 'YTCL_ALL') {
      scanAll(message.options).then(respond).catch(error =>
        respond({ok:false,error:String(error?.message||error)}));
      return true;
    }
    if (message.type === 'YTCL_CANCEL') {
      cancelled = true;
      respond({ok:true});
    }
  });
})();
