/* Motor compartido para extraer transcripciones desde pestañas normales de YouTube.
   Sin APIs externas, sin reconocimiento de audio y sin peticiones en paralelo. */
(function(root){
  'use strict';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function create(){
    let tabId=null;
    function expected(tab,videoId){
      if(!tab || tab.status!=='complete' || !tab.url)return false;
      try{
        const u=new URL(tab.url);
        return ['www.youtube.com','youtube.com','m.youtube.com'].includes(u.hostname) &&
          u.pathname==='/watch' && u.searchParams.get('v')===videoId;
      }catch{return false;}
    }
    async function waitForPage(id,videoId,timeout=45000){
      const initial=await chrome.tabs.get(id);
      if(expected(initial,videoId))return;
      await new Promise((resolve,reject)=>{
        let ended=false;
        const finish=error=>{
          if(ended)return;ended=true;clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(onUpdated);
          chrome.tabs.onRemoved.removeListener(onRemoved);
          error?reject(error):resolve();
        };
        const onUpdated=(idChanged,info,tab)=>{if(idChanged===id && expected(tab,videoId))finish();};
        const onRemoved=idChanged=>{if(idChanged===id)finish(new Error('Se cerró la pestaña de extracción.'));};
        const timer=setTimeout(()=>finish(new Error('Tiempo agotado al abrir el video solicitado.')),timeout);
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.onRemoved.addListener(onRemoved);
        chrome.tabs.get(id).then(tab=>{if(expected(tab,videoId))finish();}).catch(finish);
      });
    }
    async function withTimeout(promise,ms){
      let timer;
      try{return await Promise.race([promise,new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('YouTube tardó demasiado en devolver subtítulos.')),ms);
      })]);}finally{clearTimeout(timer);}
    }
    async function getTranscript(record){
      const url=`https://www.youtube.com/watch?v=${encodeURIComponent(record.videoId)}`;
      if(!tabId){
        const tab=await chrome.tabs.create({url,active:false});tabId=tab.id;
        try{await chrome.tabs.update(tabId,{muted:true});}catch{}
      }else{
        try{await chrome.tabs.update(tabId,{url,active:false});}
        catch{tabId=null;return getTranscript(record);}
      }
      await waitForPage(tabId,record.videoId);
      let response;
      try{response=await withTimeout(chrome.tabs.sendMessage(tabId,{action:'getTranscript'}),90000);}
      catch(err){
        if(!/Receiving end does not exist|Could not establish connection/i.test(String(err?.message||'')))throw err;
        await chrome.scripting.executeScript({target:{tabId},files:[
          'shared/formatting.js','shared/clipboard.js','shared/analytics-client.js','shared/caption-language.js','content.js'
        ]});
        await sleep(1000);
        response=await withTimeout(chrome.tabs.sendMessage(tabId,{action:'getTranscript'}),90000);
      }
      if(!response?.success || !String(response.transcript||'').trim()){
        throw new Error(response?.error||'YouTube no proporcionó transcripción para este video.');
      }
      return response;
    }
    async function close(){
      const id=tabId;tabId=null;
      if(id){try{await chrome.tabs.remove(id);}catch{}}
    }
    return {getTranscript,close};
  }
  root.TranscriptTabWorker={create};
  if(typeof module!=='undefined' && module.exports)module.exports=root.TranscriptTabWorker;
})(typeof globalThis!=='undefined'?globalThis:this);
