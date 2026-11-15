/* Watch Later: local selection + persistent transcript queue. No YouTube account API. */
(()=>{
  'use strict';
  const DB=globalThis.ChannelBatchDb, Export=globalThis.ChannelBatchExport;
  const Scanner=globalThis.WatchLaterScanner,worker=globalThis.TranscriptTabWorker.create();
  const $=id=>document.getElementById(id);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let job=null,records=[],running=false,scanning=false,stopScan=false,stopWork=false,shown=100;
  const statusText={idle:'Preparado',running:'Procesando',paused:'Pausado',done:'Finalizado'};
  function message(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);}
  function syncMessage(text,error=false){$('syncMessage').textContent=text;$('syncMessage').classList.toggle('error',error);}
  async function save(){if(job){job.updatedAt=Date.now();await DB.putJob(job);}}
  async function newJob(){
    const now=Date.now();job={id:`watch-later::${now}-${Math.random().toString(36).slice(2,8)}`,
      mode:'watch-later',name:`Watch Later · ${new Date(now).toLocaleString('es-CO')}`,
      createdAt:now,updatedAt:now,status:'idle',delayMs:5000,syncComplete:false,lastSyncAt:0,
      lastError:'',currentTitle:''};
    await save();await chrome.storage.local.set({watchLaterActiveJob:job.id});
    $('delayMs').value='5000';shown=100;await fillCollections();await render();
    syncMessage('Colección nueva. Pulsa «Sincronizar Watch Later» para importar los videos desde tu sesión de YouTube.');
  }
  async function fillCollections(){
    const all=(await DB.allJobs()).filter(j=>j.mode==='watch-later')
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const field=$('collections');field.replaceChildren(new Option('Elegir colección...', ''));
    for(const j of all)field.add(new Option(j.name||new Date(j.createdAt).toLocaleString('es-CO'),j.id));
    field.value=job?.id||'';
  }
  async function openJob(id){
    if(running||scanning)return;
    const existing=await DB.getJob(id);
    if(!existing||existing.mode!=='watch-later')return;
    job=existing;
    if(job.status==='running')job.status='paused';
    for(const r of await DB.allVideos(job.id))if(r.status==='processing')
      await DB.putVideo({...r,status:r.selected?'pending':'unselected'});
    await save();await chrome.storage.local.set({watchLaterActiveJob:id});
    $('delayMs').value=String(job.delayMs||5000);shown=100;
    await fillCollections();await render();
    syncMessage(job.lastSyncAt?`Última sincronización: ${new Date(job.lastSyncAt).toLocaleString('es-CO')}. ${job.syncComplete?'Recorrido finalizado.':'Recorrido incompleto, puedes repetirlo.'}`:'Esta colección aún no está sincronizada.');
  }
  function count(){
    const selected=records.filter(r=>r.selected);
    return {total:records.length,selected:selected.length,
      done:selected.filter(r=>r.status==='done').length,
      pending:selected.filter(r=>['pending','processing','unselected'].includes(r.status)).length,
      failed:selected.filter(r=>r.status==='failed').length};
  }
  function matches(r){
    const q=$('videoSearch').value.trim().toLowerCase();
    if(q && !`${r.title||''} ${r.channel||''} ${r.videoId}`.toLowerCase().includes(q))return false;
    const filter=$('filterStatus').value;
    if(filter==='selected'&&!r.selected)return false;
    if(filter==='unselected'&&r.selected)return false;
    if(filter==='done'&&r.status!=='done')return false;
    if(filter==='failed'&&r.status!=='failed')return false;
    return true;
  }
  function redraw(){
    const displayed=records.filter(matches),container=$('videoList');container.replaceChildren();
    const fragment=document.createDocumentFragment();
    for(const r of displayed.slice(0,shown)){
      const row=document.createElement('label');row.className='video-item'+(r.selected?' selected':'');
      const tick=document.createElement('input');tick.type='checkbox';tick.checked=!!r.selected;
      tick.disabled=running||scanning;tick.setAttribute('aria-label',`Seleccionar ${r.title||r.videoId}`);
      tick.addEventListener('change',()=>toggle(r,tick.checked).catch(e=>message(e.message,true)));
      const thumb=document.createElement('img');thumb.className='video-thumb';thumb.loading='lazy';
      thumb.alt='';thumb.src=`https://i.ytimg.com/vi/${encodeURIComponent(r.videoId)}/mqdefault.jpg`;
      const main=document.createElement('span');main.className='video-main';
      const title=document.createElement('span');title.className='video-title';title.textContent=r.title||r.videoId;
      const byline=document.createElement('span');byline.className='video-channel';byline.textContent=r.channel||`ID: ${r.videoId}`;
      main.append(title,byline);
      const state=document.createElement('span');state.className='video-state';
      const text=r.status==='done'?'Transcrito':r.status==='failed'?'Sin transcripción / error':r.status==='processing'?'Extrayendo...':r.selected?'Pendiente':'Sin seleccionar';
      state.classList.add(r.status==='done'?'badge-ok':r.status==='failed'?'badge-error':'badge-muted');
      state.textContent=text;
      if(r.status==='failed'&&r.error){const why=document.createElement('small');why.title=r.error;why.textContent=r.error.slice(0,90);state.appendChild(why);}
      row.append(tick,thumb,main,state);fragment.appendChild(row);
    }
    if(!displayed.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=records.length?'No hay videos para estos filtros.':'Aún no hay videos. Sincroniza Watch Later.';fragment.appendChild(empty);}
    container.appendChild(fragment);
    $('visibleCount').textContent=`${displayed.length} resultados`;
    $('listLimit').textContent=`Mostrando ${Math.min(shown,displayed.length)} de ${displayed.length}`;
    $('moreBtn').hidden=shown>=displayed.length;
  }
  async function render(){
    if(!job)return;
    records=await DB.allVideos(job.id);
    records.sort((a,b)=>(a.queueOrder||0)-(b.queueOrder||0));
    const c=count(),finished=c.done+c.failed;
    $('totalCount').textContent=c.total.toLocaleString('es');
    $('discoveryCount').textContent=`${c.total.toLocaleString('es')} encontrados`;
    $('selectedCount').textContent=c.selected.toLocaleString('es');
    $('doneCount').textContent=c.done.toLocaleString('es');
    $('pendingCount').textContent=c.pending.toLocaleString('es');
    const pct=c.selected?Math.round(finished/c.selected*100):0;
    $('progressFill').style.width=pct+'%';$('progressbar').setAttribute('aria-valuenow',String(pct));
    $('percent').textContent=pct+'%';
    $('progressText').textContent=c.selected?`${finished} de ${c.selected} seleccionados revisados · ${c.failed} sin transcripción/error`:'Selecciona los videos que quieras transcribir.';
    $('currentVideo').textContent=job.currentTitle||'—';
    $('jobStatus').textContent=statusText[job.status]||'Preparado';$('jobStatus').className='status-pill '+job.status;
    $('syncStatus').textContent=scanning?'Sincronizando':job.syncComplete?'Listado recorrido':job.lastSyncAt?'Recorrido incompleto':'Sin sincronizar';
    $('syncStatus').className='status-pill'+(scanning?' running':job.syncComplete?' done':'');
    $('syncBtn').disabled=running||scanning;
    $('stopSyncBtn').hidden=!scanning;
    $('collections').disabled=scanning||running;
    $('newCollectionBtn').disabled=scanning||running;
    $('selectVisibleBtn').disabled=running||scanning||!records.length;
    $('clearVisibleBtn').disabled=running||scanning||!records.length;
    $('startBtn').disabled=scanning||running||!c.pending;
    $('startBtn').textContent=job.status==='paused'?'Continuar seleccionados':'Extraer seleccionados';
    $('pauseBtn').disabled=!running;
    $('retryBtn').disabled=scanning||running||!c.failed;
    $('delayMs').disabled=scanning||running;
    $('zipBtn').disabled=!c.done;
    $('jsonlBtn').disabled=!c.done;
    redraw();
  }
  async function toggle(r,selected){
    if(running||scanning)return;
    r.selected=selected;
    if(r.status==='unselected'&&selected)r.status='pending';
    else if(r.status==='pending'&&!selected)r.status='unselected';
    await DB.putVideo(r);await render();
  }
  async function toggleMany(selected){
    if(running||scanning)return;
    const targets=records.filter(matches);
    for(const r of targets){
      if(r.selected===selected)continue;
      r.selected=selected;
      if(r.status==='unselected'&&selected)r.status='pending';
      if(r.status==='pending'&&!selected)r.status='unselected';
      await DB.putVideo(r);
    }
    await render();message(`${targets.length} videos en el filtro actual ${selected?'marcados':'desmarcados'}.`);
  }
  async function sync(){
    if(running||scanning||!job)return;
    scanning=true;stopScan=false;job.syncComplete=false;await save();await render();
    let imported=0;
    syncMessage('Abriendo Watch Later y leyendo los videos visibles...');
    try{
      const result=await Scanner.sync(async videos=>{
        const added=await DB.addVideos(job.id,videos,{status:'unselected',selected:false});
        imported+=added;
        // The scanner may rediscover old videos: never reset their selected/status/transcript fields.
        await render();
      },info=>{syncMessage(`Recorriendo Watch Later: ${info.count} videos visibles · ${info.rounds} pasos. ${imported} añadidos a esta colección.`);},()=>stopScan);
      job.lastSyncAt=Date.now();job.syncComplete=!!result.complete;
      await save();
      syncMessage(result.complete?`Sincronización finalizada: ${result.count} videos visibles. ${imported} nuevos agregados. Selecciona los que quieras transcribir.`:
        `Sincronización detenida: ${result.count} encontrados. Se conservaron todos. Puedes sincronizar otra vez.`);
    }catch(e){
      job.lastSyncAt=Date.now();job.syncComplete=false;await save();
      syncMessage(`No se pudo terminar la sincronización: ${e.message}. Los videos recopilados permanecen guardados.`,true);
    }finally{scanning=false;stopScan=false;await render();}
  }
  function restrictedError(text){return /http\s*(403|429)|too many requests|captcha|unusual traffic|rate.?limit|access denied|temporarily blocked/i.test(text);}
  async function run(){
    if(running||scanning||!job)return;
    await render();
    if(!count().pending){message('No hay videos seleccionados pendientes. Marca más videos o descarga los completados.');return;}
    running=true;stopWork=false;job.status='running';job.delayMs=Number($('delayMs').value)||5000;job.lastError='';job.currentTitle='';
    await save();await render();message('Extrayendo las transcripciones seleccionadas una a una. Mantén abierta esta pestaña.');
    let errorsInRow=0;
    try{
      const pending=records.filter(r=>r.selected&&['pending','processing','unselected'].includes(r.status));
      for(let i=0;i<pending.length&&!stopWork;i++){
        const r=pending[i];r.status='processing';r.error='';job.currentTitle=r.title||r.videoId;
        await DB.putVideo(r);await save();await render();
        try{
          const response=await worker.getTranscript(r);
          r.status='done';r.transcript=response.transcript;
          r.wordCount=response.wordCount||response.transcript.trim().split(/\s+/).length;
          r.title=response.title||r.title;r.captionLanguage=response.captionLanguage||'';
          r.captionLanguageCode=response.captionLanguageCode||'';r.completedAt=Date.now();errorsInRow=0;
        }catch(e){
          r.status='failed';r.error=String(e.message||e).slice(0,500);r.completedAt=Date.now();
          const noCaptions=/no.?captions|no.?transcript|no.?subtitles|sin subtítulos|no proporcionó transcripción|subtitles not available|private|restricted|privad|restringid|unavailable|no disponible/i.test(r.error);
          if(restrictedError(r.error)){stopWork=true;job.lastError=`YouTube restringió la solicitud de ${r.videoId}. La colección se pausó para evitar más solicitudes.`;}
          else if(!noCaptions&&++errorsInRow>=5){stopWork=true;job.lastError='Cinco errores de extracción consecutivos. Se pausó la colección.';}
          else if(noCaptions)errorsInRow=0;
        }
        await DB.putVideo(r);await render();
        if(!stopWork&&i<pending.length-1)await sleep(job.delayMs);
      }
      const left=(await DB.allVideos(job.id)).some(r=>r.selected&&r.status==='pending');
      job.status=stopWork||left?'paused':'done';job.currentTitle='';await save();await render();
      const c=count();message(job.lastError||`Terminó la revisión: ${c.done} transcripciones disponibles, ${c.failed} sin transcripción / error y ${c.pending} pendientes.`,!!job.lastError);
    }catch(e){job.status='paused';job.lastError=String(e.message||e);job.currentTitle='';await save();message('Extracción interrumpida: '+job.lastError,true);}
    finally{await worker.close();running=false;stopWork=false;await render();}
  }
  async function retry(){
    if(running||scanning)return;
    for(const r of records.filter(r=>r.selected&&r.status==='failed'))
      await DB.putVideo({...r,status:'pending',error:'',retries:(r.retries||0)+1});
    await run();
  }
  async function init(){
    const active=(await chrome.storage.local.get('watchLaterActiveJob')).watchLaterActiveJob;
    if(active&&await DB.getJob(active))await openJob(active);else await newJob();
    $('syncBtn').addEventListener('click',()=>sync().catch(e=>syncMessage(e.message,true)));
    $('stopSyncBtn').addEventListener('click',()=>{stopScan=true;syncMessage('Deteniendo sincronización después del paso actual...');});
    $('newCollectionBtn').addEventListener('click',()=>newJob().catch(e=>message(e.message,true)));
    $('collections').addEventListener('change',e=>{if(e.target.value)openJob(e.target.value).catch(err=>message(err.message,true));});
    $('videoSearch').addEventListener('input',()=>{shown=100;redraw();});
    $('filterStatus').addEventListener('change',()=>{shown=100;redraw();});
    $('moreBtn').addEventListener('click',()=>{shown+=100;redraw();});
    $('selectVisibleBtn').addEventListener('click',()=>toggleMany(true).catch(e=>message(e.message,true)));
    $('clearVisibleBtn').addEventListener('click',()=>toggleMany(false).catch(e=>message(e.message,true)));
    $('startBtn').addEventListener('click',()=>run().catch(e=>message(e.message,true)));
    $('pauseBtn').addEventListener('click',()=>{stopWork=true;message('Se pausará después del video en curso.');});
    $('retryBtn').addEventListener('click',()=>retry().catch(e=>message(e.message,true)));
    $('zipBtn').addEventListener('click',()=>{
      try{const n=Export.downloadArchive(job,records.filter(r=>r.selected));message(`Descargando ZIP con ${n} transcripciones seleccionadas.`);}catch(e){message(e.message,true);}
    });
    $('jsonlBtn').addEventListener('click',()=>{
      try{const n=Export.downloadJsonl(job,records.filter(r=>r.selected));message(`Descargando JSONL con ${n} transcripciones seleccionadas.`);}catch(e){message(e.message,true);}
    });
  }
  init().catch(e=>{message('Error al cargar Watch Later: '+e.message,true);syncMessage(e.message,true);});
  window.addEventListener('pagehide',()=>{stopScan=true;stopWork=true;worker.close().catch(()=>{});});
})();
