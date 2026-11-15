/* Batch manager: deliberately runs in a persistent extension tab, not an MV3 service worker. */
(() => {
  'use strict';
  const D=globalThis.ChannelBatchDiscovery;
  const DB=globalThis.ChannelBatchDb;
  const Dom=globalThis.ChannelBatchDomDiscovery;
  const Export=globalThis.ChannelBatchExport;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
  let job=null, running=false, stopRequested=false;
  const transcriptWorker=globalThis.TranscriptTabWorker.create();
  let shown=100, cachedRecords=[], listRefreshTimer=null;
  const isLimitReached=session=>session && session.processed>=session.limit;
  function addDiagnostic(entry) {
    if(!job)return;
    const clean={at:new Date().toISOString(),phase:entry.phase||job.phase,
      section:entry.section||job.currentSection||'',stage:entry.stage||'',
      endpoint:String(entry.endpoint||'').slice(0,120),
      status:entry.status||null,videoId:entry.videoId||'',
      message:String(entry.message||'').slice(0,420),
      retryAfter:entry.retryAfter||''};
    job.diagnostics=[...(job.diagnostics||[]),clean].slice(-120);
  }
  function diagnosticText() {
    if(!job)return 'No hay un canal seleccionado.';
    return JSON.stringify({version:'1.7.6',job:job.id,status:job.status,
      scans:job.scans,scanErrors:job.scanErrors,lastError:job.lastError,
      diagnostics:job.diagnostics||[]},null,2);
  }
  const selectedSections=()=> ['videos','shorts','streams'].filter(s=>$(s).checked);
  const setNotice=(message,error=false)=>{$('notice').textContent=message;$('notice').classList.toggle('error',error);};
  const statusTitle = {idle:'Preparado',running:'Procesando',paused:'Pausado',done:'Finalizado'};
  function isSelected() { return !!job; }
  function updateButtons() {
    $('startBtn').disabled=running;
    $('channelUrl').disabled=running;
    $('previousJobs').disabled=running;
    for (const s of ['videos','shorts','streams']) $(s).disabled=running;
    $('batchSize').disabled=running; $('delayMs').disabled=running;
    $('pauseBtn').disabled=!running;
    $('resumeBtn').disabled=running || !isSelected();
    $('rescanBtn').disabled=running || !isSelected();
    $('retryBtn').disabled=running || !cachedRecords.some(v=>v.status==='failed');
    $('zipBtn').disabled=running || !cachedRecords.some(v=>v.status==='done');
    $('jsonlBtn').disabled=$('zipBtn').disabled;
    const stillScanning=!!job?.sections?.some(s=>!job.scans?.[s]?.finished);
    $('resumeBtn').textContent=stillScanning?'Continuar canal completo':(job?.status==='done'?'Revisar canal':'Procesar pendientes');
  }
  async function saveJob() {
    if (!job) return;
    job.updatedAt=Date.now();
    await DB.putJob(job);
  }
  function counts(records) {
    return {
      total:records.length,
      done:records.filter(r=>r.status==='done').length,
      failed:records.filter(r=>r.status==='failed').length,
      pending:records.filter(r=>r.status==='pending'||r.status==='processing').length
    };
  }
  async function render() {
    if (!job) {updateButtons();return;}
    cachedRecords=await DB.allVideos(job.id);
    const c=counts(cachedRecords);
    $('totalCount').textContent=c.total.toLocaleString('es');
    $('doneCount').textContent=c.done.toLocaleString('es');
    $('failedCount').textContent=c.failed.toLocaleString('es');
    $('pendingCount').textContent=c.pending.toLocaleString('es');
    const percent=c.total ? Math.round(100*(c.done+c.failed)/c.total) : 0;
    const catalogueComplete=!!job.sections?.length && job.sections.every(s=>job.scans?.[s]?.finished);
    $('percent').textContent=percent+'%'+(catalogueComplete?'':' de los encontrados');$('progressFill').style.width=percent+'%';
    $('progressbar').setAttribute('aria-valuenow',String(percent));
    $('jobStatus').textContent=statusTitle[job.status]||job.status;
    $('jobStatus').className='status-pill '+job.status;
    const included=job.sections||[];
    const scans=job.scans||{};
    const toScan=included.filter(s=>!scans[s]?.finished);
    const scanning=running && job.phase==='scanning';
    const streaming=running && job.phase==='extracting' && job.currentSection;
    $('progressText').textContent=scanning ? `Buscando el siguiente grupo en ${job.currentSection || 'videos'} · ${c.total} encontrados` :
      `${c.done+c.failed} de ${c.total} examinados` + (toScan.length ? ` · Exploración incompleta (${toScan.length} secciones por revisar)` : ' · Listado finalizado') +
      (streaming?' · Extracción incremental':'');
    $('diagnosticLog').textContent=diagnosticText();
    $('currentVideo').textContent=job.currentTitle||'—';
    const scanErrors=Object.entries(job.scanErrors||{}).filter(([s,message])=>included.includes(s) && message);
    if (job.lastError) setNotice('Proceso interrumpido: '+job.lastError,true);
    else if (scanErrors.length && !scanning) setNotice('Exploración incompleta: '+scanErrors.map(([s,msg])=>`${s}: ${msg}`).join(' · ')+'. Pulsa «Buscar videos nuevos» para reintentar esa ruta (no borra transcripciones).',true);
    else if (running) setNotice(scanning ? 'Buscando el siguiente grupo de videos del canal.' :
      'Procesando los videos encontrados uno por uno antes de consultar el siguiente grupo. Mantén abierta esta pestaña.');
    else if (job.status==='done') setNotice(`Proceso finalizado: ${c.done} transcripciones guardadas. Exporta el ZIP o JSONL.`);
    else if (job.status==='paused') setNotice(c.pending ? `Hay ${c.pending} videos pendientes. Al continuar se procesarán y se seguirá buscando el resto del canal.` : toScan.length ? 'Ya procesaste los videos encontrados, pero el catálogo está incompleto. Pulsa «Continuar canal completo» para descubrir más videos.' : 'Los videos conocidos están procesados.');
    else setNotice('Canal guardado. Pulsa «Continuar pendientes» para reanudar.');
    drawTable();updateButtons();
  }
  function scheduleRender() {
    clearTimeout(listRefreshTimer);
    listRefreshTimer=setTimeout(()=>render().catch(err=>setNotice(err.message,true)),120);
  }
  function drawTable() {
    const query=$('videoSearch').value.trim().toLowerCase();
    const status=$('filterStatus').value;
    const records=cachedRecords.filter(v=>{
      if (status==='pending' && !['pending','processing'].includes(v.status)) return false;
      if (status!=='all' && status!=='pending' && v.status!==status) return false;
      return !query || `${v.title} ${v.videoId}`.toLowerCase().includes(query);
    });
    records.sort((a,b)=>(a.addedAt||0)-(b.addedAt||0));
    const tbody=$('videoTable');tbody.replaceChildren();
    const slice=records.slice(0,shown);
    if (!slice.length) {
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=4;td.className='empty';td.textContent='No hay videos con estos filtros.';tr.appendChild(td);tbody.appendChild(tr);
    }
    for(const v of slice){
      const tr=document.createElement('tr');
      const title=document.createElement('td');
      const link=document.createElement('a'); link.href=v.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=v.title;
      const sub=document.createElement('small');sub.textContent=v.videoId;
      title.append(link,sub);tr.appendChild(title);
      const type=document.createElement('td');type.textContent=({videos:'Video',shorts:'Short',streams:'Directo'}[v.section]||'Video');tr.appendChild(type);
      const state=document.createElement('td');state.className='status';
      const states={pending:['Pendiente','badge-muted'],processing:['En curso','badge-muted'],done:['Completado','badge-ok'],failed:['Error','badge-error']};
      const meta=states[v.status]||[v.status,'badge-muted'];
      const span=document.createElement('span');span.className=meta[1];span.textContent=meta[0];state.appendChild(span);
      if (v.error){ const detail=document.createElement('small');detail.textContent=v.error;detail.title=v.error;state.appendChild(detail); }
      tr.appendChild(state);
      const words=document.createElement('td');words.textContent=v.wordCount?.toLocaleString('es')||'—';tr.appendChild(words);
      tbody.appendChild(tr);
    }
    $('visibleCount').textContent=records.length.toLocaleString('es')+' videos';
    $('moreBtn').hidden=records.length<=shown;
    $('listLimit').textContent=`Mostrando ${Math.min(shown,records.length)} de ${records.length}`;
  }
  async function fillJobs() {
    const old=$('previousJobs').value;
    const jobs=(await DB.allJobs()).filter(j=>j.mode!=='links' && j.mode!=='watch-later').sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    $('previousJobs').replaceChildren(new Option('Seleccionar canal anterior...', ''));
    for(const j of jobs) $('previousJobs').add(new Option(`${j.id.replace('https://www.youtube.com/','')} · ${new Date(j.updatedAt||j.createdAt).toLocaleDateString('es')}`,j.id));
    $('previousJobs').value=job?.id||old||'';
  }
  // v1.7.4 could incorrectly finish after just one visible group; migrate EACH
  // old job exactly once. Data in IndexedDB videos is never cleared or re-extracted.
  function upgradeScanState() {
    if(!job || (job.discoveryEngineVersion||0)>=2)return false;
    job.scans={};job.scanErrors={};job.lastScanWarning='';job.lastError='';
    job.discoveryEngineVersion=2;
    if(job.status==='done')job.status='paused';
    addDiagnostic({phase:'manager',stage:'migration',
      message:'Migración a exploración v1.7.5: se reinició solo el listado; las transcripciones se conservaron.'});
    return true;
  }
  function syncRunPreferences() {
    job.batchSize=Number($('batchSize').value)||0;
    job.delayMs=Number($('delayMs').value)||5000;
  }
  async function openJob(id) {
    if (running) return;
    const existing=await DB.getJob(id);
    if (!existing) return;
    job=existing;
    const migrated=upgradeScanState();
    if(migrated)job.lastScanWarning='La nueva versión volverá a recorrer el canal sin repetir transcripciones guardadas.';
    if (job.status==='running') {
      job.status='paused';job.phase='paused';job.currentTitle='';
    }
    for(const v of await DB.allVideos(id)) if(v.status==='processing') await DB.putVideo({...v,status:'pending'});
    await saveJob();
    await chrome.storage.local.set({channelBatchActiveJob:id});
    $('channelUrl').value=id;
    for(const s of ['videos','shorts','streams']) $(s).checked=(job.sections||[]).includes(s);
    $('batchSize').value=String(job.batchSize??0);
    $('delayMs').value=String(job.delayMs??5000);
    shown=100;
    await render(); await fillJobs();
  }
  async function prepareJob() {
    const url=D.normalizeChannel($('channelUrl').value);
    const sections=selectedSections();
    if (!sections.length) throw new Error('Selecciona al menos un tipo de video.');
    const existing=await DB.getJob(url);
    if (existing) {
      job=existing;
      upgradeScanState();
      // A new section is scanned on the next run without reprocessing successful videos.
      job.sections=sections;
      job.scans=job.scans||{};job.scanErrors=job.scanErrors||{};
      job.batchSize=Number($('batchSize').value);
      job.delayMs=Number($('delayMs').value);
    } else {
      job={id:url,sections,batchSize:Number($('batchSize').value),delayMs:Number($('delayMs').value),
        createdAt:Date.now(),updatedAt:Date.now(),scans:{},scanErrors:{},status:'idle',phase:'idle',currentTitle:'',discoveryEngineVersion:2};
    }
    $('channelUrl').value=url;
    await saveJob(); await chrome.storage.local.set({channelBatchActiveJob:url});
    await fillJobs(); await render();
  }
  /* A discovery callback is awaited after EACH page. The complete page is saved,
     then pending videos are transcribed before ANY next channel-page request.
     A single session budget is shared across every section and discovery method. */
  async function discover(session) {
    job.phase='scanning';await saveJob();scheduleRender();
    for (const section of job.sections) {
      if(stopRequested || isLimitReached(session)) break;
      const progress=job.scans[section]||{pages:0,nextToken:null,finished:false};
      if(progress.finished) continue;
      // A denied listing route is never probed again without an explicit rescan.
      if(job.scanErrors?.[section])continue;
      job.currentSection=section;job.currentTitle=`Buscando el siguiente grupo de ${section}...`;
      await saveJob();scheduleRender();
      const onPage=async(videos,checkpoint)=>{
        const inserted=await DB.addVideos(job.id,videos);
        job.scans[section]=checkpoint;
        delete job.scanErrors[section];
        addDiagnostic({phase:'discovery',section,stage:checkpoint.method||'page',
          message:`Página ${checkpoint.pages}: ${videos.length} videos observados, ${inserted} nuevos, fin=${!!checkpoint.finished}`});
        await saveJob();scheduleRender();
        // This is the key change: process this page NOW, not once all pages were listed.
        if(!stopRequested && !isLimitReached(session))await extractPending(session);
        if(!stopRequested && !isLimitReached(session)) {
          job.phase='scanning';job.currentTitle=`Buscando el siguiente grupo de ${section}...`;
          await saveJob();scheduleRender();
        }
      };
      try {
        await D.discoverSection(job.id, section, progress, onPage,
          ()=>stopRequested||isLimitReached(session),
          {pageDelayMs:Math.max(5000,job.delayMs||5000)});
      } catch(err) {
        const originalMessage=String(err.message||err);
        addDiagnostic({phase:'discovery',section,stage:err.stage||'listing',
          status:err.httpStatus,endpoint:err.endpoint,message:originalMessage,retryAfter:err.retryAfter});
        // A 403 in a private continuation may not affect normal watch pages.
        // Try the ordinary visible channel page once, not the denied endpoint.
        if(err.httpStatus!==429 && !stopRequested && !isLimitReached(session) && Dom) {
          try {
            job.phase='scanning';job.currentTitle=`Exploración visual de ${section} (alternativa)...`;
            await saveJob();scheduleRender();
            await Dom.discoverSection(job.id,section,progress,onPage,
              ()=>stopRequested||isLimitReached(session),
              message=>{job.currentTitle=message;scheduleRender();});
            addDiagnostic({phase:'discovery',section,stage:'browser-scroll',message:'Alternativa completada.'});
            await saveJob();
            continue;
          }catch(fallbackError){
            addDiagnostic({phase:'discovery',section,stage:'browser-scroll',
              message:String(fallbackError.message||fallbackError)});
            job.scanErrors[section]=`Listado: ${originalMessage} · Recorrido visual: ${fallbackError.message||fallbackError}`;
          }
        }else job.scanErrors[section]=originalMessage;
        if(err.httpStatus===429){
          stopRequested=true;
          job.lastError='YouTube devolvió HTTP 429 durante el listado. Se detuvieron las solicitudes para respetar el límite.';
        }else if(err.httpStatus===403){
          job.lastScanWarning=`La exploración de ${section} recibió HTTP 403. Puedes exportar los resultados que sí se obtuvieron.`;
        }
        await saveJob();scheduleRender();
        // On a 403, avoid probing further sections in this run; keep extracted data.
        if(err.httpStatus===403)break;
      }
    }
    job.currentSection='';
  }
  // El mismo motor de pestañas se utiliza en las modalidades por canal y por enlaces.
  const getTranscript=record=>transcriptWorker.getTranscript(record);
  const releaseWorkerTab=()=>transcriptWorker.close();
  async function extractPending(session) {
    if(stopRequested || isLimitReached(session))return;
    job.phase='extracting';job.currentTitle='';await saveJob();scheduleRender();
    const remaining=(await DB.allVideos(job.id)).filter(v=>v.status==='pending');
    remaining.sort((a,b)=>(a.addedAt||0)-(b.addedAt||0));
    try {
      for(const record of remaining) {
        if(stopRequested || isLimitReached(session))break;
        record.status='processing';record.error='';job.currentTitle=record.title;
        await DB.putVideo(record);await saveJob();scheduleRender();
        try {
          const answer=await getTranscript(record);
          record.status='done';record.transcript=answer.transcript;
          record.wordCount=answer.wordCount||answer.transcript.split(/\s+/).length;
          record.title=answer.title||record.title;
          record.captionLanguage=answer.captionLanguage||'';
          record.captionLanguageCode=answer.captionLanguageCode||'';
          record.completedAt=Date.now();
          session.consecutiveNetworkErrors=0;
        }catch(err){
          record.status='failed';record.error=String(err.message||err).slice(0,500);
          record.completedAt=Date.now();
          const msg=record.error.toLowerCase();
          const restricted=/http 429|too many requests|captcha|unusual traffic|rate.?limit|http 403|access denied|temporarily blocked/.test(msg);
          const unavailable=/no captions|no transcript|no subtitles|sin subtítulos|no proporcionó transcripción|private|restricted|privad|restringid|unavailable|no disponible/i.test(msg);
          addDiagnostic({phase:'extraction',stage:'watch/transcript',videoId:record.videoId,
            status:(msg.match(/http\s+(403|429)/)||[])[1]||null,message:record.error});
          if(restricted){
            stopRequested=true;
            job.lastError=`Se pausó la extracción después de una respuesta de acceso restringido (${record.videoId}). Consulta el diagnóstico.`;
          }else if(!unavailable){
            if(++session.consecutiveNetworkErrors>=5){
              stopRequested=true;
              job.lastError='Cinco fallos de extracción consecutivos. Se pausó para evitar solicitudes innecesarias.';
            }
          }else session.consecutiveNetworkErrors=0;
        }
        await DB.putVideo(record);
        session.processed++;
        scheduleRender();
        // Pausa between individual watch requests, including across page boundaries.
        // Don't spend the last delay when the user pressed Pause or budget is exhausted.
        if(!stopRequested && !isLimitReached(session))await sleep(job.delayMs||5000);
      }
    }finally {await releaseWorkerTab();}
  }
  async function run({scan=true}={}) {
    if(running || !job)return;
    running=true;stopRequested=false;
    const session={processed:0,limit:job.batchSize||Infinity,consecutiveNetworkErrors:0};
    syncRunPreferences();
    job.status='running';job.currentTitle='';job.currentSection='';job.lastError='';
    await saveJob();await render();
    try {
      // Older 1.7.2/1.7.3 queues are processed before ANY new listing request.
      await extractPending(session);
      if(scan && !stopRequested && !isLimitReached(session))await discover(session);
      const records=await DB.allVideos(job.id);
      const hasPending=records.some(r=>r.status==='pending');
      const hasUnscanned=job.sections.some(s=>!job.scans[s]?.finished);
      job.status=stopRequested || hasPending || hasUnscanned ? 'paused':'done';
      job.phase=job.status;
      job.currentTitle='';job.currentSection='';
      await saveJob();
      if(!records.length && hasUnscanned) {
        job.lastError='No se pudieron enumerar videos. Comprueba la página del canal y revisa el diagnóstico.';
        await saveJob();
      }
    }catch(err){
      job.status='paused';job.phase='paused';job.currentTitle='';job.currentSection='';
      job.lastError=String(err.message||err);
      addDiagnostic({phase:'manager',stage:'run',message:job.lastError});
      await saveJob();setNotice('Proceso interrumpido: '+job.lastError,true);
    }finally{
      await releaseWorkerTab();running=false;stopRequested=false;
      await render();await fillJobs();
    }
  }
  async function rerunScan() {
    if(running||!job)return;
    syncRunPreferences();
    for(const s of job.sections) job.scans[s]={pages:0,nextToken:null,finished:false};
    job.scanErrors={};job.lastScanWarning='';
    addDiagnostic({phase:'manager',stage:'manual-rescan',message:'El usuario reinició la exploración de secciones.'});
    await saveJob();await run();
  }
  async function retryErrors() {
    if(running||!job)return;
    const failed=(await DB.allVideos(job.id)).filter(v=>v.status==='failed');
    for(const record of failed) await DB.putVideo({...record,status:'pending',error:'',retries:(record.retries||0)+1});
    await run({scan:false});
  }
  async function startNew(event) {
    event.preventDefault();
    if(running)return;
    try {await prepareJob();await run();}
    catch(err){setNotice(err.message||String(err),true);}
  }
  async function init() {
    $('channelForm').addEventListener('submit',startNew);
    $('pauseBtn').addEventListener('click',()=>{stopRequested=true;setNotice('Pausa solicitada: se finalizará el video que está en curso.');});
    // Resume always attempts the rest of the catalogue. An old blocked route is
    // cleared once on migration; a new one keeps its error until explicit rescan.
    $('resumeBtn').addEventListener('click',()=>run({scan:true}).catch(err=>setNotice(err.message,true)));
    $('rescanBtn').addEventListener('click',()=>rerunScan().catch(err=>setNotice(err.message,true)));
    $('retryBtn').addEventListener('click',()=>retryErrors().catch(err=>setNotice(err.message,true)));
    $('previousJobs').addEventListener('change',e=>{if(e.target.value)openJob(e.target.value).catch(err=>setNotice(err.message,true));});
    for(const key of ['videoSearch','filterStatus']) $(key).addEventListener(key==='videoSearch'?'input':'change',()=>{shown=100;drawTable();});
    $('moreBtn').addEventListener('click',()=>{shown+=100;drawTable();});
    $('zipBtn').addEventListener('click',async()=>{
      try {const count=Export.downloadArchive(job,await DB.allVideos(job.id),$('exportRange').value);setNotice(`Preparando el ZIP con ${count} transcripciones.`);}
      catch(err){setNotice(err.message,true);}
    });
    $('copyDiagnostics').addEventListener('click',async()=>{
      try {await navigator.clipboard.writeText(diagnosticText());
        setNotice('Diagnóstico copiado al portapapeles. No contiene claves de acceso.');}
      catch(err){setNotice('No se pudo copiar el diagnóstico: '+err.message,true);}
    });
    $('jsonlBtn').addEventListener('click',async()=>{
      try {const count=Export.downloadJsonl(job,await DB.allVideos(job.id));setNotice(`Preparando JSONL con ${count} transcripciones.`);}
      catch(err){setNotice(err.message,true);}
    });
    await fillJobs();
    const saved=(await chrome.storage.local.get('channelBatchActiveJob')).channelBatchActiveJob;
    if(saved && await DB.getJob(saved)) await openJob(saved);
    updateButtons();
  }
  init().catch(error=>setNotice('No se pudo abrir la base de datos local: '+error.message,true));
  // On browser/page close, worker tab is cleaned up if the event can be serviced.
  window.addEventListener('pagehide',()=>{
    stopRequested=true;
    transcriptWorker.close().catch(()=>{});
  });
})();
