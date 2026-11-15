(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let sourceTabId = null, sourceWindowId = null, channelKey = null;
  let videos = [], excluded = new Set(), copiedIds = new Set();
  let filtered = [], selected = [], batches = [], currentBatch = 0, shown = 100, scanning = false;
  const keyFor = key => 'ytTranscriptLinkCollector::' + key;
  const validVideosTab = url => {
    try {
      const u = new URL(url);
      return ['www.youtube.com','youtube.com','m.youtube.com'].includes(u.hostname) &&
        /^\/(@[^/]+|channel\/UC[\w-]+|c\/[^/]+|user\/[^/]+)\/videos\/?$/.test(u.pathname);
    } catch { return false; }
  };
  const getKey = url => {
    const parsed = new URL(url);
    return 'https://www.youtube.com' + parsed.pathname.replace(/\/videos\/?$/, '');
  };
  function status(message, error=false) {
    $('notice').textContent = message;
    $('notice').classList.toggle('error',error);
  }
  function setBusy(value) {
    scanning = value;
    for (const id of ['sourceTab','refreshTabs','scanAll','scanVisible','clearResults','maxVideos','goToSource'])
      $(id).disabled=value;
    $('cancelScan').disabled=!value;
  }
  async function save() {
    if (!channelKey) return;
    const state={version:1,videos,excluded:[...excluded],copiedIds:[...copiedIds],savedAt:Date.now()};
    await chrome.storage.local.set({[keyFor(channelKey)]:state,ytTranscriptLinksLastChannel:channelKey});
  }
  async function load(key) {
    if (!key) return;
    channelKey=key;
    const result=await chrome.storage.local.get(keyFor(key));
    const state=result[keyFor(key)] || {};
    videos=Array.isArray(state.videos)?state.videos:[];
    excluded=new Set(state.excluded || []);
    copiedIds=new Set(state.copiedIds || []);
    currentBatch=0; shown=100; render();
    status(videos.length ? 'Resultados recuperados para este canal: '+videos.length+' videos.' :
      'Canal seleccionado. Puedes recopilar los videos visibles o recorrer la página completa.');
  }
  async function refreshTabs(preferred) {
    const tabs=(await chrome.tabs.query({})).filter(t => validVideosTab(t.url));
    const select=$('sourceTab');
    select.replaceChildren(new Option('Selecciona la pestaña Videos...', ''));
    for (const tab of tabs) select.add(new Option((tab.title||'YouTube')+' · #'+tab.id, String(tab.id)));
    let chosen=tabs.find(t=>t.id===preferred) || tabs.find(t=>t.id===sourceTabId);
    if(!chosen) {
      const active=(await chrome.tabs.query({active:true,currentWindow:true}))[0];
      chosen=tabs.find(t=>t.id===active?.id) || tabs[0];
    }
    if (chosen) {select.value=String(chosen.id);await selectTab(chosen.id);}
    else {sourceTabId=null;sourceWindowId=null;status('Abre un canal de YouTube en su pestaña Videos y pulsa Actualizar pestañas.',true);}
  }
  async function selectTab(id) {
    const tab=await chrome.tabs.get(Number(id));
    if(!validVideosTab(tab.url))throw new Error('Esta pestaña no corresponde a la sección Videos de un canal.');
    sourceTabId=tab.id;sourceWindowId=tab.windowId;
    const key=getKey(tab.url);
    if(key!==channelKey)await load(key);
    await chrome.storage.local.set({ytTranscriptLinksSourceTab:tab.id});
  }
  async function send(message) {
    if(!sourceTabId)throw new Error('Selecciona una pestaña del canal.');
    try {return await chrome.tabs.sendMessage(sourceTabId,message);}
    catch(error) {
      const description=String(error?.message||error);
      if(!/receiving end does not exist|could not establish connection/i.test(description)) throw error;
      await chrome.scripting.executeScript({target:{tabId:sourceTabId},files:['channel-links/scanner.js']});
      return chrome.tabs.sendMessage(sourceTabId,message);
    }
  }
  function ageLimit() {
    if($('ageFilter').value==='all')return null;
    const raw=$('ageFilter').value==='custom' ? $('customDays').value : $('ageFilter').value;
    const number=Number(raw);
    return Number.isFinite(number)&&number>0?number:365;
  }
  function batchSize() {
    return Math.max(1,Math.min(50,Math.floor(Number($('batchSize').value)||50)));
  }
  function reviewVideos() {
    const search=$('titleSearch').value.trim().toLocaleLowerCase();
    return filtered.filter(v=>
      ($('showExcluded').checked || !excluded.has(v.videoId)) &&
      (!search || (v.title+' '+v.videoId).toLocaleLowerCase().includes(search)));
  }
  function render() {
    const max=ageLimit();
    filtered=videos.filter(v=>max===null || (v.ageDays===null||v.ageDays===undefined ?
      $('includeUnknown').checked : Number(v.ageDays)<=max));
    selected=filtered.filter(v=>!excluded.has(v.videoId));
    batches=[];
    for(let n=0;n<selected.length;n+=batchSize())batches.push(selected.slice(n,n+batchSize()));
    currentBatch=Math.min(currentBatch,Math.max(0,batches.length-1));
    $('customDaysWrap').hidden=$('ageFilter').value!=='custom';
    $('foundCount').textContent=String(videos.length);
    $('filteredCount').textContent=String(filtered.length);
    $('selectedCount').textContent=String(selected.length);
    $('batchCount').textContent=String(batches.length);
    renderReview();renderBatches();
  }
  function renderReview() {
    const rows=reviewVideos(), container=$('videoList');
    container.replaceChildren();
    for(const video of rows.slice(0,shown)) {
      const row=document.createElement('div');row.className='video-row'+(excluded.has(video.videoId)?' excluded':'');
      const check=document.createElement('input');check.type='checkbox';check.checked=!excluded.has(video.videoId);
      check.setAttribute('aria-label','Incluir '+video.title);
      check.addEventListener('change',async()=>{
        if(check.checked)excluded.delete(video.videoId);else excluded.add(video.videoId);
        render();await save();
      });
      const info=document.createElement('div'),link=document.createElement('a');
      link.href=video.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=video.title;
      const date=document.createElement('small');
      date.textContent=(video.dateText||'Fecha desconocida')+' · '+video.videoId+
        (copiedIds.has(video.videoId)?' · Enlace copiado':'');
      info.append(link,date);row.append(check,info);container.append(row);
    }
    if(!rows.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='No hay videos que coincidan.';container.append(empty);}
    $('visibleCount').textContent=rows.length+' videos';
    $('listLimit').textContent='Mostrando '+Math.min(rows.length,shown)+' de '+rows.length;
    $('moreVideos').hidden=rows.length<=shown;
  }
  function renderBatches() {
    const tabs=$('batchTabs');tabs.replaceChildren();
    batches.forEach((batch,index)=>{
      const button=document.createElement('button');button.className='batch-tab'+(index===currentBatch?' current':'')+
        (batch.every(v=>copiedIds.has(v.videoId))?' copied':'');
      button.textContent='Lote '+(index+1);
      button.addEventListener('click',()=>{currentBatch=index;renderBatches();});
      tabs.append(button);
    });
    const batch=batches[currentBatch]||[];
    $('batchInfo').textContent=batch.length ?
      'Lote '+(currentBatch+1)+' de '+batches.length+' · '+batch.length+' enlaces · '+
      batch.filter(v=>copiedIds.has(v.videoId)).length+' copiados' : 'Selecciona videos para crear lotes.';
    const preview=$('batchPreview');preview.replaceChildren();
    for(const video of batch) {
      const a=document.createElement('a');a.href=video.url;a.target='_blank';a.rel='noopener noreferrer';
      a.textContent=(copiedIds.has(video.videoId)?'✓ ':'')+video.title;preview.append(a);
    }
    for(const id of ['copyBatch','copyNext','resetCopied'])$(id).disabled=!batches.length;
    $('previousBatch').disabled=currentBatch<=0;
    $('nextBatch').disabled=currentBatch>=batches.length-1;
  }
  async function copyBatch(advance=false) {
    const batch=batches[currentBatch]||[];
    if(!batch.length)return;
    const urls=batch.map(v=>v.url).join('\n');
    await navigator.clipboard.writeText(urls);
    for(const v of batch)copiedIds.add(v.videoId);
    await save();
    const index=currentBatch;
    if(advance && currentBatch<batches.length-1)currentBatch++;
    render();
    status(batch.length+' enlaces copiados del lote '+(index+1)+'. Confirma la importación en NotebookLM por separado.');
  }
  async function scan(all) {
    if(scanning)return;
    if(!sourceTabId)throw new Error('Selecciona primero una pestaña Videos.');
    const tab=await chrome.tabs.get(sourceTabId);
    if(!validVideosTab(tab.url) || getKey(tab.url)!==channelKey)throw new Error('El canal seleccionado cambió. Actualiza las pestañas.');
    setBusy(true);
    status('Recopilando videos. No cierres la pestaña de YouTube...');
    try {
      const response=await send({type:all?'YTCL_ALL':'YTCL_VISIBLE',options:{
        maxVideos:Number($('maxVideos').value)||0,restoreScroll:true}});
      if(!response?.ok && !(response?.videos?.length))throw new Error(response?.error||'No se pudieron recopilar los enlaces.');
      const collected=new Map(videos.map(v=>[v.videoId,v]));
      for(const video of response.videos||[]) {
        if(!collected.has(video.videoId))collected.set(video.videoId,video);
        else {
          const old=collected.get(video.videoId);
          collected.set(video.videoId,{...old,title:old.title?.startsWith('Video ')?video.title:old.title,
            ageDays:video.ageDays===null?old.ageDays:video.ageDays,
            dateText:video.ageDays===null?old.dateText:video.dateText,
            observedAt:video.observedAt});
        }
      }
      videos=[...collected.values()];
      await save();render();
      const uncertain=all && !response.completed && !response.truncated && !response.cancelled || !response.ok;
      status(videos.length+' videos guardados para este canal. '+
        (response.cancelled?'Escaneo cancelado; se conservaron los encontrados.':
        response.truncated?'Se alcanzó el máximo configurado.':
        uncertain?'El escaneo no confirmó el final o se interrumpió; el listado puede estar incompleto.':
        all?'El recorrido llegó al final visible de la página (no garantiza un catálogo exhaustivo).':'Solo se recopilaron los videos visibles.'),uncertain);
    } finally {setBusy(false);}
  }
  async function init() {
    const state=await chrome.storage.local.get(['ytTranscriptLinksSourceTab']);
    await refreshTabs(state.ytTranscriptLinksSourceTab);
    $('refreshTabs').addEventListener('click',()=>refreshTabs().catch(e=>status(e.message,true)));
    $('sourceTab').addEventListener('change',e=>selectTab(e.target.value).catch(e=>status(e.message,true)));
    $('goToSource').addEventListener('click',async()=>{
      if(!sourceTabId)return;
      await chrome.tabs.update(sourceTabId,{active:true});
      if(sourceWindowId)await chrome.windows.update(sourceWindowId,{focused:true});
    });
    $('scanAll').addEventListener('click',()=>scan(true).catch(e=>status(e.message,true)));
    $('scanVisible').addEventListener('click',()=>scan(false).catch(e=>status(e.message,true)));
    $('cancelScan').addEventListener('click',()=>send({type:'YTCL_CANCEL'}).then(()=>status('Cancelación solicitada.')).catch(e=>status(e.message,true)));
    $('clearResults').addEventListener('click',async()=>{
      if(!channelKey)return;
      if(!confirm('¿Eliminar los resultados y las marcas de copiado de este canal?'))return;
      videos=[];excluded.clear();copiedIds.clear();await save();render();status('Resultados del canal eliminados.');
    });
    for(const id of ['ageFilter','customDays','includeUnknown','batchSize']) {
      $(id).addEventListener('change',render);
      $(id).addEventListener('input',render);
    }
    for(const id of ['titleSearch','showExcluded'])$(id).addEventListener(id==='titleSearch'?'input':'change',()=>{shown=100;renderReview();});
    $('moreVideos').addEventListener('click',()=>{shown+=100;renderReview();});
    async function markRows(include) {
      for(const v of reviewVideos())if(include)excluded.delete(v.videoId);else excluded.add(v.videoId);
      render();await save();
    }
    $('selectVisible').addEventListener('click',()=>markRows(true).catch(e=>status(e.message,true)));
    $('excludeVisible').addEventListener('click',()=>markRows(false).catch(e=>status(e.message,true)));
    $('copyBatch').addEventListener('click',()=>copyBatch().catch(e=>status('Error al copiar: '+e.message,true)));
    $('copyNext').addEventListener('click',()=>copyBatch(true).catch(e=>status('Error al copiar: '+e.message,true)));
    $('previousBatch').addEventListener('click',()=>{currentBatch--;renderBatches();});
    $('nextBatch').addEventListener('click',()=>{currentBatch++;renderBatches();});
    $('resetCopied').addEventListener('click',async()=>{copiedIds.clear();await save();render();});
    chrome.runtime.onMessage.addListener(message=>{
      if(message?.type==='YTCL_PROGRESS'&&message.channelKey===channelKey&&scanning)
        $('scanDetail').textContent='Escaneo: '+message.count+' videos únicos acumulados · '+message.rounds+' recorridos. Cancelar conserva los ya detectados.';
    });
    render();
  }
  init().catch(error=>status('Error al inicializar el recopilador: '+error.message,true));
})();