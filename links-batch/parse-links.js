/* Validador puro y seguro de URLs de videos, reutilizable en pruebas Node. */
(function(root){
  'use strict';
  const isId=id=>/^[A-Za-z0-9_-]{11}$/.test(id||'');
  function parseOne(value){
    let url;
    try{url=new URL(value);}catch{return null;}
    if(!['http:','https:'].includes(url.protocol) || url.username || url.password)return null;
    const host=url.hostname.toLowerCase();
    let videoId=null,section='videos';
    if(host==='youtu.be' || host==='www.youtu.be')videoId=url.pathname.split('/')[1];
    else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
      if(url.pathname==='/watch')videoId=url.searchParams.get('v');
      else {
        const match=url.pathname.match(/^\/(shorts|live|embed|v)\/([^/]+)\/?$/);
        if(match){videoId=match[2];if(match[1]==='shorts')section='shorts';if(match[1]==='live')section='streams';}
      }
    }
    if(!isId(videoId))return null;
    return {videoId,section,title:`Video ${videoId}`,url:`https://www.youtube.com/watch?v=${videoId}`};
  }
  function parse(text){
    const tokens=String(text||'').split(/[\s,;]+/).map(t=>t.trim()).filter(Boolean);
    const seen=new Set(),videos=[],invalid=[];
    let duplicates=0;
    for(let raw of tokens){
      raw=raw.replace(/^[<(\["']+|[>\])"'.!?]+$/g,'');
      const item=parseOne(raw);
      if(!item){invalid.push(raw.slice(0,160));continue;}
      if(seen.has(item.videoId)){duplicates++;continue;}
      seen.add(item.videoId);videos.push(item);
    }
    return {videos,invalid,duplicates};
  }
  root.YoutubeLinkParser={parse,parseOne};
  if(typeof module!=='undefined' && module.exports)module.exports=root.YoutubeLinkParser;
})(typeof globalThis!=='undefined'?globalThis:this);
