/* Minimal, ZIP64-free, uncompressed ZIP writer with UTF-8 names. No CDN required. */
(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for (let i=0; i<256; i++) {
    let c=i;
    for (let j=0; j<8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crcTable[i]=c>>>0;
  }
  function crc32(bytes) {
    let crc=0xFFFFFFFF;
    for (let i=0; i<bytes.length; i++) crc=crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function safeName(name) {
    return String(name || 'sin-titulo').normalize('NFKC')
      .replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/\s+/g, ' ').replace(/\.+$/g, '').trim().slice(0,110) || 'sin-titulo';
  }
  function le16(dv, offset, n) { dv.setUint16(offset, n, true); }
  function le32(dv, offset, n) { dv.setUint32(offset, n, true); }
  function zip(files) {
    const parts=[], directory=[];
    let offset=0;
    for (const file of files) {
      const nameBytes=encoder.encode(file.name);
      const data=typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
      if (nameBytes.length>65535 || data.length>=0xFFFFFFFF) throw new Error('Archivo demasiado grande para ZIP.');
      const crc=crc32(data), length=data.byteLength;
      const local=new Uint8Array(30+nameBytes.length), ld=new DataView(local.buffer);
      le32(ld,0,0x04034b50); le16(ld,4,20); le16(ld,6,0x0800); le16(ld,8,0); // UTF-8, stored
      le32(ld,14,crc); le32(ld,18,length); le32(ld,22,length); le16(ld,26,nameBytes.length);
      local.set(nameBytes,30);
      parts.push(local, data);
      const central=new Uint8Array(46+nameBytes.length), cd=new DataView(central.buffer);
      le32(cd,0,0x02014b50); le16(cd,4,20); le16(cd,6,20); le16(cd,8,0x0800);
      le32(cd,16,crc); le32(cd,20,length); le32(cd,24,length); le16(cd,28,nameBytes.length);
      le32(cd,42,offset); central.set(nameBytes,46);
      directory.push(central);
      offset+=local.length+length;
    }
    const directorySize=directory.reduce((n,part)=>n+part.length,0);
    if (files.length>65535 || offset+directorySize>=0xFFFFFFFF) throw new Error('ZIP demasiado grande. Descarga lotes menores.');
    const end=new Uint8Array(22), ev=new DataView(end.buffer);
    le32(ev,0,0x06054b50); le16(ev,8,files.length); le16(ev,10,files.length);
    le32(ev,12,directorySize); le32(ev,16,offset);
    return new Blob([...parts,...directory,end],{type:'application/zip'});
  }
  function download(blob, filename) {
    const href=URL.createObjectURL(blob);
    const el=document.createElement('a'); el.href=href;el.download=filename;
    document.body.appendChild(el);el.click();el.remove();
    setTimeout(()=>URL.revokeObjectURL(href),60000);
  }
  function csvCell(x) {return '"'+String(x??'').replace(/"/g,'""')+'"';}
  function errorsCsv(records) {
    return '\uFEFF'+['videoId','titulo','url','estado','motivo'].join(',')+'\r\n'+
      records.filter(v=>v.status==='failed').map(v=>[v.videoId,v.title,v.url,v.status,v.error||''].map(csvCell).join(',')).join('\r\n');
  }
  function sourceLabel(job){return job.mode==='watch-later' ? 'YouTube Watch Later · selección personal' : job.mode==='links' ? 'Lista de enlaces' : `Canal: ${job.id}`;}
  function exportFileName(job){return job.mode==='watch-later' ? 'youtube_watch_later' : job.mode==='links' ? 'youtube_enlaces' : `youtube_${safeName(job.id.split('/').pop())}`;}
  function downloadArchive(job, records, range='all') {
    const done=records.filter(r=>r.status==='done' && r.transcript);
    if(job.mode==='links'||job.mode==='watch-later')done.sort((a,b)=>(a.queueOrder||0)-(b.queueOrder||0));
    const chosen = range==='last100' ? done.slice(-100) : done;
    if (!chosen.length) throw new Error('Todavía no hay transcripciones para exportar.');
    if (chosen.length>5000) throw new Error('Para descargar más de 5.000 archivos, utiliza ZIP por bloques de 100.');
    const files=[], rows=[];
    let idx=0;
    for (const r of chosen) {
      idx++;
      const filename=`transcripciones/${String(idx).padStart(5,'0')}_${safeName(r.title)}_${r.videoId}.txt`;
      files.push({name:filename,data:`${r.title}\n${r.url}\nIdioma: ${r.captionLanguage || 'no indicado'}\n\n${r.transcript}\n`});
      rows.push([r.videoId,r.title,r.url,r.section,r.wordCount||0,r.captionLanguageCode||'',filename]);
    }
    const manifest='\uFEFF'+['videoId','titulo','url','tipo','palabras','idioma','archivo'].join(',')+'\r\n'+
      rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
    files.push({name:'indice.csv',data:manifest});
    files.push({name:'errores.csv',data:errorsCsv(records)});
    files.push({name:'LEEME.txt',data:`${sourceLabel(job)}\nTranscripciones exportadas: ${chosen.length}\nErrores registrados: ${records.filter(r=>r.status==='failed').length}\nFecha: ${new Date().toISOString()}\nLos videos sin subtítulos no se transcriben automáticamente.\n`});
    const blob=zip(files);
    download(blob,`${exportFileName(job)}_${chosen.length}_transcripciones.zip`);
    return chosen.length;
  }
  function downloadJsonl(job,records) {
    const done=records.filter(r=>r.status==='done' && r.transcript);
    if(job.mode==='links'||job.mode==='watch-later')done.sort((a,b)=>(a.queueOrder||0)-(b.queueOrder||0));
    if (!done.length) throw new Error('No hay transcripciones para exportar.');
    const lines=done.map(r=>JSON.stringify({source:job.mode==='watch-later'?'watch-later':job.mode==='links'?'links':'channel',channel:['links','watch-later'].includes(job.mode)?null:job.id,videoId:r.videoId,title:r.title,url:r.url,section:r.section,
      language:r.captionLanguageCode||'',wordCount:r.wordCount||0,transcript:r.transcript}));
    download(new Blob([lines.join('\n')+'\n'],{type:'application/x-ndjson;charset=utf-8'}),
      `${exportFileName(job)}_transcripciones.jsonl`);
    return done.length;
  }
  root.ChannelBatchExport={zip,downloadArchive,downloadJsonl,safeName,crc32};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChannelBatchExport;
})(typeof globalThis !== 'undefined' ? globalThis : this);
