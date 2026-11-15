/* Channel discovery. No external dependencies; works in extension pages. */
(function (root) {
  'use strict';
  const SECTIONS = ['videos', 'shorts', 'streams'];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function normalizeChannel(input) {
    let str = String(input || '').trim();
    if (!str) throw new Error('Introduce el enlace o @usuario de un canal de YouTube.');
    if (/^@[^/\s?#]+$/u.test(str)) str = `https://www.youtube.com/${str}`;
    else if (!/^https?:\/\//i.test(str)) str = `https://${str}`;
    let url;
    try { url = new URL(str); } catch { throw new Error('La dirección del canal no es válida.'); }
    if (!['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname.toLowerCase())) {
      throw new Error('Solo se admiten URLs de canales de youtube.com.');
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (!segments.length || !/^(@[^/]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)$/.test(segments.slice(0,2).join('/')) &&
      !segments[0].startsWith('@')) {
      throw new Error('Utiliza un canal como youtube.com/@usuario o youtube.com/channel/UC...');
    }
    let path = segments[0].startsWith('@') ? `/${segments[0]}` : `/${segments[0]}/${segments[1] || ''}`;
    if (!/^\/@[^/\s?#]+$/.test(path) && !/^\/(channel|c|user)\/[^/]+$/.test(path)) {
      throw new Error('No se reconoce la dirección del canal.');
    }
    return 'https://www.youtube.com' + path;
  }

  function findJsonObject(html, identifier) {
    const re = new RegExp('(?:var\\s+|window\\.)?' + identifier + '\\s*=\\s*\\{', 'g');
    const match = re.exec(html);
    if (!match) throw new Error('YouTube no proporcionó ' + identifier + '. Puede ser una página de consentimiento o un bloqueo.');
    const start = html.indexOf('{', match.index + match[0].length - 1);
    let inString = false, escaped = false, depth = 0;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
    throw new Error('YouTube devolvió información incompleta del canal.');
  }

  function findOne(root, key, maxNodes = 30000) {
    const queue = [root];
    const visited = new Set();
    while (queue.length && visited.size < maxNodes) {
      const node = queue.shift();
      if (!node || typeof node !== 'object' || visited.has(node)) continue;
      visited.add(node);
      if (Object.prototype.hasOwnProperty.call(node, key)) return node[key];
      if (Array.isArray(node)) queue.push(...node.filter(v => v && typeof v === 'object'));
      else for (const val of Object.values(node)) if (val && typeof val === 'object') queue.push(val);
    }
    return null;
  }

  function textFrom(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.runs)) return value.runs.map(r => r.text || '').join('');
    return '';
  }

  function itemToVideo(item, section) {
    const content = item?.richItemRenderer?.content || item?.richItemRenderer || item;
    const vr = content?.videoRenderer || content?.gridVideoRenderer || content?.reelItemRenderer;
    let id = vr?.videoId;
    let title = textFrom(vr?.title) || textFrom(vr?.headline);
    const lockup = content?.lockupViewModel || content?.shortsLockupViewModel;
    if (!id && lockup) {
      id = lockup.contentId || lockup.entityId;
      title = textFrom(lockup.metadata?.lockupMetadataViewModel?.title) ||
        textFrom(lockup.overlayMetadata?.primaryText) ||
        textFrom(lockup.accessibilityText) || title;
    }
    // Shorts were historically represented by reelItemRenderer.
    if (!id && content?.shortsLockupViewModel) id = content.shortsLockupViewModel.contentId;
    if (!/^[A-Za-z0-9_-]{11}$/.test(String(id || ''))) return null;
    return {
      videoId: id, title: (title || `Video ${id}`).trim(), section,
      url: section === 'shorts' ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`
    };
  }

  function parseItems(items, section) {
    const unique = new Map();
    for (const item of items || []) {
      const video = itemToVideo(item, section);
      if (video && !unique.has(video.videoId)) unique.set(video.videoId, video);
    }
    return [...unique.values()];
  }

  function continuation(items) {
    for (const item of items || []) {
      const token = item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
        item?.continuationItemRenderer?.button?.buttonRenderer?.command?.continuationCommand?.token;
      if (token) return token;
    }
    return null;
  }

  function initialItems(initialData) {
    const tabs = initialData?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const selected = tabs.find(t => t.tabRenderer?.selected && t.tabRenderer?.content);
    const tab = selected || tabs.find(t => t.tabRenderer?.content);
    const content = tab?.tabRenderer?.content || initialData;
    const grid = findOne(content, 'richGridRenderer');
    if (grid && Array.isArray(grid.contents)) return grid.contents;
    const list = findOne(content, 'gridRenderer');
    if (list?.items) return list.items;
    const sectionList = findOne(content, 'sectionListRenderer');
    if (sectionList) {
      const nested = findOne(sectionList, 'richGridRenderer');
      if (nested?.contents) return nested.contents;
    }
    return null;
  }

  function nextItems(response) {
    for (const key of ['onResponseReceivedActions', 'onResponseReceivedEndpoints']) {
      for (const action of response?.[key] || []) {
        const items = action?.appendContinuationItemsAction?.continuationItems ||
          action?.reloadContinuationItemsCommand?.continuationItems;
        if (Array.isArray(items)) return items;
      }
    }
    const items = response?.continuationContents?.richGridContinuation?.contents ||
      response?.continuationContents?.gridContinuation?.items ||
      response?.continuationContents?.sectionListContinuation?.contents;
    return Array.isArray(items) ? items : null;
  }

  function getConfig(html) {
    const get = key => {
      const match = html.match(new RegExp('"' + key + '"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"'));
      if (!match) return '';
      try { return JSON.parse('"' + match[1] + '"'); } catch { return match[1]; }
    };
    const apiKey = get('INNERTUBE_API_KEY');
    if (!apiKey) throw new Error('No fue posible localizar la configuración de YouTube.');
    return {
      apiKey, visitorData: get('VISITOR_DATA'),
      clientVersion: get('INNERTUBE_CLIENT_VERSION') || '2.20251001.00.00'
    };
  }

  async function getJson(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {credentials:'include', redirect:'follow', ...init, signal:controller.signal});
      if (!response.ok) {
        const stage = String(url).includes('/youtubei/v1/browse') ? 'la paginación del canal' : 'la página del canal';
        const err = new Error(`YouTube respondió HTTP ${response.status} al consultar ${stage}.`);
        err.httpStatus = response.status;
        err.stage = String(url).includes('/youtubei/v1/browse') ? 'continuation' : 'channel-page';
        err.retryAfter = response.headers?.get?.('Retry-After') || '';
        // Diagnostic data deliberately excludes the query string (API key).
        err.endpoint = new URL(url).pathname;
        throw err;
      }
      return response;
    } finally { clearTimeout(timer); }
  }

  // Post from an ordinary YouTube tab rather than from chrome-extension://.
  // This keeps the listing request in the same origin/session as the site itself;
  // no authentication headers, cookies or request URLs are exported to diagnostics.
  async function waitForTab(tabId, timeout=45000) {
    const current=await chrome.tabs.get(tabId);
    if(current.status==='complete')return;
    await new Promise((resolve,reject)=>{
      let settled=false;
      const finish=err=>{
        if(settled)return;settled=true;clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdate);
        chrome.tabs.onRemoved.removeListener(onRemove);
        err?reject(err):resolve();
      };
      const onUpdate=(id,info)=>{if(id===tabId&&info.status==='complete')finish();};
      const onRemove=id=>{if(id===tabId)finish(new Error('Se cerró la pestaña que consultaba el canal.'));};
      const timer=setTimeout(()=>finish(new Error('La pestaña del canal tardó demasiado en cargar.')),timeout);
      chrome.tabs.onUpdated.addListener(onUpdate);
      chrome.tabs.onRemoved.addListener(onRemove);
      chrome.tabs.get(tabId).then(t=>{if(t.status==='complete')finish();}).catch(finish);
    });
  }

  async function requestPageInTab(tabId, config, token) {
    // Runs with page origin, as a normal page request. The response is returned
    // to this extension page only as a parsed JSON object (no page credentials).
    const executions=await chrome.scripting.executeScript({
      target:{tabId},world:'MAIN',
      func:async (key, clientVersion, visitorData, nextToken)=>{
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),30000);
        try {
          const body={
            context:{client:{clientName:'WEB',clientVersion,hl:'es',gl:'US',
              ...(visitorData?{visitorData}:{})}},
            continuation:nextToken
          };
          const response=await fetch('/youtubei/v1/browse?key='+encodeURIComponent(key)+'&prettyPrint=false',{
            method:'POST',credentials:'same-origin',
            headers:{'Content-Type':'application/json','X-Youtube-Client-Name':'1',
              'X-Youtube-Client-Version':clientVersion,
              ...(visitorData?{'X-Goog-Visitor-Id':visitorData}:{})},
            body:JSON.stringify(body),signal:controller.signal
          });
          return {ok:response.ok,status:response.status,
            retryAfter:response.headers.get('Retry-After')||'',
            data:response.ok?await response.json():null};
        }finally{clearTimeout(timer);}
      },args:[config.apiKey,config.clientVersion,config.visitorData,token]
    });
    const result=executions?.[0]?.result;
    if(!result||typeof result.status!=='number')
      throw new Error('No fue posible obtener una respuesta de paginación en la pestaña de YouTube.');
    if(!result.ok){
      const err=new Error(`YouTube respondió HTTP ${result.status} al consultar la paginación desde su propia página.`);
      err.httpStatus=result.status;err.stage='continuation-youtube-tab';
      err.endpoint='/youtubei/v1/browse';err.retryAfter=result.retryAfter||'';
      throw err;
    }
    return result.data;
  }

  async function discoverSection(channelUrl, section, checkpoint, onPage, shouldStop, options={}) {
    if (!SECTIONS.includes(section)) throw new Error('Sección desconocida.');
    const sectionUrl = `${channelUrl}/${section}`;
    const htmlResponse = await getJson(sectionUrl);
    const html = await htmlResponse.text();
    const config = getConfig(html);
    // On resume, request the page again for a fresh API key and client version.
    let token = checkpoint?.nextToken || null;
    let page = Number(checkpoint?.pages || 0);
    let items = null;
    if (!token) {
      items = initialItems(findJsonObject(html, 'ytInitialData'));
      if (!items) throw new Error(`YouTube no expuso la lista de ${section}; puede haber cambiado su interfaz.`);
    }
    const seen = new Set();
    let channelTabId=null;
    try {
      while (!shouldStop()) {
        if (items === null) {
          if (seen.has(token)) throw new Error('YouTube devolvió una paginación repetida.');
          seen.add(token);
          // Page content was already saved and transcribed in onPage.
          await sleep(options.pageDelayMs??5000);
          if(shouldStop())return;
          let responseData;
          if(typeof chrome!=='undefined' && chrome.tabs?.create && chrome.scripting?.executeScript){
            if(channelTabId===null){
              const tab=await chrome.tabs.create({url:sectionUrl,active:false});
              channelTabId=tab.id;
              await waitForTab(channelTabId);
            }
            responseData=await requestPageInTab(channelTabId,config,token);
          }else{
            // Non-Chrome test harness: preserve a deterministic fallback.
            const body={context:{client:{clientName:'WEB',clientVersion:config.clientVersion,hl:'es',gl:'US',
              ...(config.visitorData?{visitorData:config.visitorData}:{})}},continuation:token};
            const response=await getJson(`https://www.youtube.com/youtubei/v1/browse?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`,{
              method:'POST',headers:{'Content-Type':'application/json',
                'X-Youtube-Client-Name':'1','X-Youtube-Client-Version':config.clientVersion,
                ...(config.visitorData?{'X-Goog-Visitor-Id':config.visitorData}:{})},
              body:JSON.stringify(body)});
            responseData=await response.json();
          }
          items=nextItems(responseData);
          if(!items)throw new Error(`YouTube cambió el formato de paginación (${section}, página ${page + 1}). No se consideró terminado el canal.`);
        }
        const videos=parseItems(items,section);
        const nextToken=continuation(items);
        // A full-sized group with no parsed continuation can mean YouTube
        // changed its renderer, not that the catalogue ends at exactly 32.
        // Make the UI verify by normal page scrolling before claiming done.
        const ambiguousEnd=!nextToken && videos.length>=30;
        await onPage(videos,{pages:page+1,nextToken,finished:!nextToken&&!ambiguousEnd,
          lastPageSize:videos.length,method:channelTabId===null?'initial':'youtube-tab'});
        page++;
        token=nextToken;
        if(ambiguousEnd){
          const err=new Error('El listado devolvió un grupo completo sin continuación verificable. Se comprobará el final desde la página visible de YouTube.');
          err.stage='ambiguous-list-end';
          throw err;
        }
        if(!token)return;
        items=null;
      }
    }finally{
      if(channelTabId!==null){try{await chrome.tabs.remove(channelTabId);}catch{}}
    }
  }

  root.ChannelBatchDiscovery = {normalizeChannel, findJsonObject, getConfig, itemToVideo,
    parseItems, continuation, initialItems, nextItems, discoverSection};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChannelBatchDiscovery;
})(typeof globalThis !== 'undefined' ? globalThis : this);
