/* Gestor persistente de listas de URLs. No comparte cola ni estado con el canal. */
(() => {
  'use strict';
  const DB=globalThis.ChannelBatchDb;
  const Export=globalThis.ChannelBatchExport;
  const Parser=globalThis.YoutubeLinkParser;
  const worker=globalThis.TranscriptTabWorker.create();
  const $=id=>document.getElementById(id);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let job=null,running=false,stopRequested=false,records=[],shown=100;
  const statusText={idle:'Preparado',running:'Procesando',paused:'Pausado',done:'Finalizado'};
  const count=()=>({
    total:records.length,
    done:records.filter(r=>r.status==='done').length,
    failed:records.filter(r=>r.status==='failed').length,
    pending:records.filter(r=>r.status==='pending'||r.status==='processing').length
  });
  function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
  const draftKey=()=>`linkBatchDraft::${job?.id||'no-list'}`;
  async function save(){if(job){job.updatedAt=Date.now();await DB.putJob(job);}}
  async function listJobs(){
    const jobs=(await DB.allJobs()).filter(j=>j.mode==='links').sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const select=$('savedLists');select.replaceChildren(new Option('Seleccionar lista anterior...', ''));
    for(const j of jobs)select.add(new Option(`${j.name||'Lista de enlaces'} · ${new Date(j.createdAt).toLocaleString('es-CO')}`,j.id));
    select.value=job?.id||'';
  }
  async function newJob(){
    const now=Date.now();
    job={id:`links-batch::${now}-${Math.random().toString(36).slice(2,8)}`,mode:'links',
      name:`Lista ${new Date(now).toLocaleString('es-CO')}`,createdAt:now,updatedAt:now,
      delayMs:5000,status:'idle',currentTitle:'',lastError:''};
    await save();await chrome.storage.local.set({linkBatchActiveJob:job.id});
    $('linksInput').value='';$('linkDelay').value='5000';
    shown=100;await listJobs();await render();
    notice('Lista nueva creada. Pega tus enlaces y pulsa «Extraer todas las transcripciones».');
  }
  async function openJob(id){
    if(running)return;
    const result=await DB.getJob(id);if(!result || result.mode!=='links')return;
    job=result;
    if(job.status==='running')job.status='paused';
    for(const r of await DB.allVideos(id))if(r.status==='processing')await DB.putVideo({...r,status:'pending'});
    await save();await chrome.storage.local.set({linkBatchActiveJob:id});
    $('linkDelay').value=String(job.delayMs||5000);
    $('linksInput').value=localStorage.getItem(draftKey())||'';
    shown=100;await listJobs();await render();
    const c=count();notice(c.total?`Lista recuperada: ${c.done} transcripciones y ${c.pending} pendientes.`:'Esta lista está vacía. Puedes añadir enlaces.');
  }
  function updateButtons(){
    if(!job)return;
    const c=count();
    $('linksInput').disabled=running;
    $('addBtn').disabled=running;
    $('startLinksBtn').disabled=running;
    $('linkDelay').disabled=running;
    $('savedLists').disabled=running;
    $('newListBtn').disabled=running;
    $('pauseBtn').disabled=!running;
    $('resumeBtn').disabled=running||!c.pending;
    $('retryBtn').disabled=running||!c.failed;
    $('zipBtn').disabled=!c.done;
    $('jsonlBtn').disabled=!c.done;
    $('startLinksBtn').textContent=c.pending?'Extraer todas las transcripciones':'Extraer transcripciones';
  }
  async function render(){
    if(!job)return;
    records=await DB.allVideos(job.id);
    records.sort((a,b)=>(a.queueOrder||0)-(b.queueOrder||0) || (a.addedAt||0)-(b.addedAt||0));
    const c=count();
    $('totalCount').textContent=c.total.toLocaleString('es');
    $('doneCount').textContent=c.done.toLocaleString('es');
    $('failedCount').textContent=c.failed.toLocaleString('es');
    $('pendingCount').textContent=c.pending.toLocaleString('es');
    const percent=c.total?Math.round(100*(c.done+c.failed)/c.total):0;
    $('progressFill').style.width=percent+'%';$('percent').textContent=percent+'%';
    $('progressbar').setAttribute('aria-valuenow',String(percent));
    $('progressText').textContent=c.total?`${c.done+c.failed} de ${c.total} videos examinados`:'Todavía no hay videos en esta lista.';
    $('linkJobStatus').className='status-pill '+job.status;
    $('linkJobStatus').textContent=statusText[job.status]||'Preparado';
    $('currentVideo').textContent=job.currentTitle||'—';
    drawTable();updateButtons();
  }
  function drawTable(){
    const query=$('videoSearch').value.trim().toLowerCase();
    const filter=$('filterStatus').value;
    const filtered=records.filter(r=>{
      if(filter==='pending'&&!['pending','processing'].includes(r.status))return false;
      if(filter!=='all'&&filter!=='pending'&&r.status!==filter)return false;
      return !query||`${r.title||''} ${r.videoId}`.toLowerCase().includes(query);
    });
    const body=$('videoTable');body.replaceChildren();
    for(const r of filtered.slice(0,shown)){
      const tr=document.createElement('tr');
      const title=document.createElement('td');
      const link=document.createElement('a');link.href=r.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=r.title||r.videoId;
      const sub=document.createElement('small');sub.textContent=r.videoId;title.append(link,sub);tr.appendChild(title);
      const type=document.createElement('td');type.textContent=({shorts:'Short',streams:'Directo',videos:'Video'}[r.section]||'Video');tr.appendChild(type);
      const state=document.createElement('td');state.className='status';
      const states={pending:['Pendiente','badge-muted'],processing:['En curso','badge-muted'],done:['Completado','badge-ok'],failed:['Sin transcripción / error','badge-error']};
      const meta=states[r.status]||[r.status,'badge-muted'];
      const badge=document.createElement('span');badge.className=meta[1];badge.textContent=meta[0];state.appendChild(badge);
      if(r.error){const details=document.createElement('small');details.textContent=r.error;details.title=r.error;state.appendChild(details);}
      tr.appendChild(state);
      const words=document.createElement('td');words.textContent=r.wordCount?.toLocaleString('es')||'—';tr.appendChild(words);
      const action=document.createElement('td');
      if(!running && (r.status==='pending'||r.status==='failed')){
        const remove=document.createElement('button');remove.type='button';remove.className='remove-link';remove.textContent='Quitar';
        remove.setAttribute('aria-label',`Quitar ${r.videoId} de la lista`);
        remove.addEventListener('click',async()=>{
          if(running)return;
          await DB.deleteVideo(r.key);await render();notice('Video quitado de esta lista.');
        });action.appendChild(remove);
      }
      tr.appendChild(action);body.appendChild(tr);
    }
    if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='No hay videos con estos filtros.';tr.appendChild(td);body.appendChild(tr);}
    $('visibleCount').textContent=filtered.length.toLocaleString('es')+' videos';
    $('moreBtn').hidden=shown>=filtered.length;
    $('listLimit').textContent=`Mostrando ${Math.min(shown,filtered.length)} de ${filtered.length}`;
  }
  async function addFromInput(){
    const value=$('linksInput').value.trim();if(!value)return {added:0,invalid:[],duplicates:0};
    const parsed=Parser.parse(value);
    const added=await DB.addVideos(job.id,parsed.videos);
    // Conserva las entradas no reconocidas para que el usuario pueda corregirlas.
    $('linksInput').value=parsed.invalid.join('\n');
    localStorage.setItem(draftKey(),$('linksInput').value);
    if(added){job.status=job.status==='done'?'paused':job.status;await save();}
    await render();
    const ignored=parsed.duplicates+(parsed.videos.length-added);
    notice(`${added} video(s) añadido(s) · ${ignored} duplicado(s) omitido(s)`+
      (parsed.invalid.length?` · ${parsed.invalid.length} enlace(s) no válido(s) que permanecen en el cuadro.`:'.'),
      !!parsed.invalid.length && !added);
    return {added,invalid:parsed.invalid,duplicates:ignored};
  }
  function restrictedError(message){return /http\s*(403|429)|too many requests|captcha|unusual traffic|rate.?limit|access denied|temporarily blocked/i.test(message);}
  async function run(){
    if(running||!job)return;
    await render();
    if(!count().pending){notice('No hay enlaces pendientes. Puedes añadir más videos o descargar las transcripciones guardadas.');return;}
    running=true;stopRequested=false;
    job.status='running';job.lastError='';job.currentTitle='';job.delayMs=Number($('linkDelay').value)||5000;
    await save();await render();
    notice('Procesando transcripciones una por una. Los resultados se guardan automáticamente.');
    let errorsInRow=0;
    try{
      const pending=records.filter(r=>r.status==='pending');
      for(let i=0;i<pending.length;i++){
        const r=pending[i];if(stopRequested)break;
        r.status='processing';r.error='';job.currentTitle=r.title||r.videoId;
        await DB.putVideo(r);await save();await render();
        try{
          const response=await worker.getTranscript(r);
          r.status='done';r.transcript=response.transcript;
          r.wordCount=response.wordCount||response.transcript.trim().split(/\s+/).length;
          r.title=response.title||r.title;
          r.captionLanguage=response.captionLanguage||'';
          r.captionLanguageCode=response.captionLanguageCode||'';
          r.completedAt=Date.now();errorsInRow=0;
        }catch(error){
          r.status='failed';r.error=String(error.message||error).slice(0,500);r.completedAt=Date.now();
          const unavail=/no.?captions|no.?transcript|no.?subtitles|sin subtítulos|no proporcionó transcripción|subtitles not available|private|restricted|privad|restringid|unavailable|no disponible/i.test(r.error);
          if(restrictedError(r.error)){
            stopRequested=true;job.lastError=`YouTube limitó una solicitud del video ${r.videoId}. La lista queda guardada para continuar más tarde.`;
          }else if(!unavail && ++errorsInRow>=5){
            stopRequested=true;job.lastError='Cinco errores de extracción seguidos. La lista se pausó para evitar solicitudes adicionales.';
          }else if(unavail){errorsInRow=0;}
        }
        await DB.putVideo(r);await render();
        if(!stopRequested && i<pending.length-1)await sleep(job.delayMs);
      }
      const remaining=(await DB.allVideos(job.id)).some(r=>r.status==='pending');
      job.status=stopRequested||remaining?'paused':'done';
      job.currentTitle='';await save();await render();
      if(job.lastError)notice(job.lastError,true);
      else{
        const c=count();
        notice(job.status==='done'?`Lista examinada: ${c.done} transcripciones listas para descargar y ${c.failed} videos sin transcripción o con error.`:
          `Extracción pausada. Se conservaron ${c.done} transcripciones. Puedes continuar los pendientes.`);
      }
    }catch(error){
      job.status='paused';job.lastError=String(error.message||error);job.currentTitle='';
      await save();notice(`Proceso interrumpido: ${job.lastError}`,true);
    }finally{
      await worker.close();running=false;stopRequested=false;await render();await listJobs();
    }
  }
  async function retry(){
    if(running)return;
    const failed=(await DB.allVideos(job.id)).filter(r=>r.status==='failed');
    for(const r of failed)await DB.putVideo({...r,status:'pending',error:'',retries:(r.retries||0)+1});
    await run();
  }
  async function init(){
    const saved=(await chrome.storage.local.get('linkBatchActiveJob')).linkBatchActiveJob;
    if(saved && await DB.getJob(saved))await openJob(saved);else await newJob();
    $('linksInput').value=localStorage.getItem(draftKey())||'';
    $('linksInput').addEventListener('input',()=>localStorage.setItem(draftKey(),$('linksInput').value));
    $('addBtn').addEventListener('click',()=>addFromInput().catch(err=>notice(err.message,true)));
    $('startLinksBtn').addEventListener('click',async()=>{
      try{await addFromInput();await run();}catch(err){notice(err.message,true);}
    });
    $('pauseBtn').addEventListener('click',()=>{stopRequested=true;notice('Pausa solicitada: se terminará el video en curso.');});
    $('resumeBtn').addEventListener('click',()=>run().catch(err=>notice(err.message,true)));
    $('retryBtn').addEventListener('click',()=>retry().catch(err=>notice(err.message,true)));
    $('newListBtn').addEventListener('click',()=>newJob().catch(err=>notice(err.message,true)));
    $('savedLists').addEventListener('change',e=>{if(e.target.value)openJob(e.target.value).catch(err=>notice(err.message,true));});
    for(const id of ['videoSearch','filterStatus']) $(id).addEventListener(id==='videoSearch'?'input':'change',()=>{shown=100;drawTable();});
    $('moreBtn').addEventListener('click',()=>{shown+=100;drawTable();});
    $('zipBtn').addEventListener('click',async()=>{
      try{const n=Export.downloadArchive(job,await DB.allVideos(job.id));notice(`Descargando ZIP con ${n} transcripciones.`);}
      catch(error){notice(error.message,true);}
    });
    $('jsonlBtn').addEventListener('click',async()=>{
      try{const n=Export.downloadJsonl(job,await DB.allVideos(job.id));notice(`Descargando JSONL con ${n} transcripciones.`);}
      catch(error){notice(error.message,true);}
    });
  }
  init().catch(err=>notice('No se pudo abrir la lista local: '+err.message,true));
  window.addEventListener('pagehide',()=>{stopRequested=true;worker.close().catch(()=>{});});
})();
