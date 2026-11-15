/* Watch Later is a private playlist. Read only the rendered YouTube playlist
   in the signed-in browser tab. Do not fetch internal APIs or read cookies. */
(function(root){
  'use strict';
  const WATCH_LATER_URL='https://www.youtube.com/playlist?list=WL';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function isWatchLater(url){
    try{const u=new globalThis.URL(url);return u.protocol==='https:' &&
      ['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname) &&
      u.pathname==='/playlist' && u.searchParams.get('list')==='WL';}
    catch{return false;}
  }
  // Runs in YouTube's isolated script world. No extension globals are required.
  function scanPage(){
    const playlistUrl=new URL(location.href);
    const valid=['youtube.com','www.youtube.com','m.youtube.com'].includes(playlistUrl.hostname) &&
      playlistUrl.pathname==='/playlist' && playlistUrl.searchParams.get('list')==='WL';
    if(!valid)return {valid:false,url:location.href,title:document.title,videos:[]};
    const containers=[...document.querySelectorAll('ytd-playlist-video-renderer, ytd-playlist-video-list-renderer yt-lockup-view-model')];
    const videos=[],seen=new Set();
    for(const card of containers){
      const anchors=card.querySelectorAll('a#video-title, a[href*="watch?v="], a[href*="/shorts/"]');
      let id='',url='',heading='';
      for(const anchor of anchors){
        let link;
        try{link=new URL(anchor.getAttribute('href')||anchor.href,location.origin);}catch{continue;}
        if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(link.hostname))continue;
        id=link.pathname==='/watch'?link.searchParams.get('v'):(link.pathname.startsWith('/shorts/')?link.pathname.split('/')[2]:'');
        if(!/^[a-zA-Z0-9_-]{11}$/.test(id||''))continue;
        url=`https://www.youtube.com/watch?v=${id}`;
        heading=(card.querySelector('a#video-title, a.yt-lockup-metadata-view-model__title, #video-title')||anchor);
        break;
      }
      if(!id||seen.has(id))continue;
      seen.add(id);
      const title=(heading?.getAttribute('title')||heading?.textContent||heading?.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim().slice(0,500)||`Video ${id}`;
      const byline=(card.querySelector('#channel-name a, ytd-channel-name a, .yt-content-metadata-view-model__metadata-row a, .yt-lockup-metadata-view-model__metadata a, #byline a')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,180);
      videos.push({videoId:id,title,url,section:'videos',channel:byline});
    }
    const scroller=document.scrollingElement||document.documentElement;
    const beforeHeight=scroller.scrollHeight;
    const beforeTop=scroller.scrollTop;
    const viewport=scroller.clientHeight||window.innerHeight;
    const continuation=[...document.querySelectorAll('ytd-continuation-item-renderer')].filter(el=>el.getClientRects().length);
    if(continuation.length)continuation[continuation.length-1].scrollIntoView({block:'end'});
    else scroller.scrollTo(0,beforeHeight);
    return {valid:true,url:location.href,title:document.title,videos,rows:containers.length,
      beforeHeight,beforeTop,afterTop:scroller.scrollTop,
      atBottom:scroller.scrollTop+viewport>=beforeHeight-120,
      hasContinuation:continuation.length>0,
      hint:videos.length?'':(document.body?.innerText||'').slice(0,650)};
  }
  async function waitForTab(tabId,ms=45000){
    const tab=await chrome.tabs.get(tabId);
    if(tab.status==='complete')return;
    await new Promise((resolve,reject)=>{
      let finished=false;
      const done=err=>{if(finished)return;finished=true;clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(onUpdated);chrome.tabs.onRemoved.removeListener(onRemoved);
        err?reject(err):resolve();};
      const onUpdated=(id,info)=>{if(id===tabId&&info.status==='complete')done();};
      const onRemoved=id=>{if(id===tabId)done(new Error('Se cerró la pestaña de Watch Later.'));};
      const timeout=setTimeout(()=>done(new Error('YouTube no terminó de cargar Watch Later.')),ms);
      chrome.tabs.onUpdated.addListener(onUpdated);chrome.tabs.onRemoved.addListener(onRemoved);
      chrome.tabs.get(tabId).then(t=>{if(t.status==='complete')done();}).catch(done);
    });
  }
  async function sync(onBatch,onStatus,shouldStop){
    const open=(await chrome.tabs.query({url:['https://www.youtube.com/*','https://youtube.com/*']}))
      .find(t=>isWatchLater(t.url||''));
    const tab=open||await chrome.tabs.create({url:WATCH_LATER_URL,active:true});
    const created=!open,tabId=tab.id;
    if(open){try{await chrome.tabs.update(tabId,{active:true});}catch{}}
    let known=new Set(),lastCount=-1,lastHeight=-1,stable=0,rounds=0;
    try{
      await waitForTab(tabId);
      await sleep(1500);
      for(;rounds<450&&!shouldStop();rounds++){
        let result;
        try{result=(await chrome.scripting.executeScript({target:{tabId},func:scanPage}))?.[0]?.result;}
        catch(err){throw new Error('No fue posible leer la pestaña Watch Later: '+String(err.message||err));}
        if(!result?.valid)throw new Error('YouTube no abrió tu lista Watch Later. Inicia sesión y comprueba https://www.youtube.com/playlist?list=WL.');
        const fresh=(result.videos||[]).filter(v=>!known.has(v.videoId));
        for(const v of fresh)known.add(v.videoId);
        if(fresh.length)await onBatch(fresh);
        if(!known.size && rounds>=3){
          if(/sign in|iniciar sesi[oó]n|consent|verify|captcha|unusual traffic|acceder/i.test(result.title+' '+result.hint))
            throw new Error('YouTube solicita iniciar sesión o verificar tu acceso a Watch Later.');
        }
        onStatus?.({count:known.size,rounds:rounds+1,hasContinuation:result.hasContinuation});
        const unchanged=result.atBottom&&!fresh.length && lastCount===known.size && lastHeight===result.beforeHeight;
        stable=unchanged?stable+1:0;
        lastCount=known.size;lastHeight=result.beforeHeight;
        if(stable>=5 && rounds>=5){
          if(result.hasContinuation)throw new Error('El listado todavía tiene una continuación sin cargar. La sincronización quedó incompleta; puedes reintentar.');
          if(!known.size)throw new Error('No se encontraron tarjetas de videos. Revisa que hayas iniciado sesión y que Watch Later contenga videos.');
          return {count:known.size,complete:true,rounds:rounds+1};
        }
        await sleep(1200+(rounds%3)*300);
      }
      if(shouldStop())return {count:known.size,complete:false,stopped:true,rounds};
      throw new Error('Se alcanzó el límite de exploración. Se conservaron los videos encontrados, pero el listado puede estar incompleto.');
    }finally{
      // Never close the user's pre-existing YouTube tab. Close only a tab that we created.
      if(created){try{await chrome.tabs.remove(tabId);}catch{}}
    }
  }
  root.WatchLaterScanner={sync,isWatchLater,scanPage};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.WatchLaterScanner;
})(typeof globalThis!=='undefined'?globalThis:this);
