/* IndexedDB (separate from the original extension history and settings). */
(function (root) {
  'use strict';
  const DB_NAME = 'channel-transcripts-v1';
  const STORE_JOBS = 'jobs', STORE_VIDEOS = 'videos';
  let dbPromise;
  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE_JOBS)) database.createObjectStore(STORE_JOBS, {keyPath:'id'});
        if (!database.objectStoreNames.contains(STORE_VIDEOS)) {
          const store = database.createObjectStore(STORE_VIDEOS, {keyPath:'key'});
          store.createIndex('byJob', 'jobId', {unique:false});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }
  async function request(store, method, args = [], index = null) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(store, 'readwrite');
      const object = index ? tx.objectStore(store).index(index) : tx.objectStore(store);
      const req = object[method](...args);
      let result;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || req.error);
      tx.onabort = () => reject(tx.error || new Error('La base de datos se interrumpió.'));
    });
  }
  const getJob = id => request(STORE_JOBS, 'get', [id]);
  const putJob = job => request(STORE_JOBS, 'put', [job]);
  const allJobs = () => request(STORE_JOBS, 'getAll');
  const allVideos = id => request(STORE_VIDEOS, 'getAll', [IDBKeyRange.only(id)], 'byJob');
  const putVideo = record => request(STORE_VIDEOS, 'put', [record]);
  const deleteVideo = key => request(STORE_VIDEOS, 'delete', [key]);
  async function addVideos(jobId, videos, options = {}) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_VIDEOS, 'readwrite');
      const store = tx.objectStore(STORE_VIDEOS);
      const lookup = store.index('byJob').getAll(IDBKeyRange.only(jobId));
      let inserted = 0;
      lookup.onsuccess = () => {
        const existing = lookup.result || [];
        const seen = new Set(existing.map(r => r.videoId));
        let order = existing.reduce((max,r) => Math.max(max,r.queueOrder||0),0);
        const timestamp = Date.now();
        for (const video of videos) {
          if (seen.has(video.videoId)) continue;
          seen.add(video.videoId);
          store.put({...video,key:`${jobId}::${video.videoId}`,jobId,
            status:options.status||'pending',selected:options.selected??false,retries:0,addedAt:timestamp,queueOrder:++order});
          inserted++;
        }
      };
      tx.oncomplete = () => resolve(inserted);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la lista.'));
    });
  }
  root.ChannelBatchDb = {db, getJob, putJob, allJobs, allVideos, putVideo, deleteVideo, addVideos};
})(globalThis);
