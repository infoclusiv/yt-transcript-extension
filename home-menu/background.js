/* Extrae un video seleccionado desde un menú de YouTube sin navegar la pestaña de inicio.
   Reutiliza el motor existente de extracción por pestaña temporal. */
(() => {
  'use strict';
  const ACTION = 'extractHomeMenuTranscript';
  const VALID_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.action !== ACTION) return false;

    const senderUrl = sender.tab?.url || sender.url || '';
    let authorized = false;
    try {
      const url = new URL(senderUrl);
      authorized = url.protocol === 'https:' &&
        ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname);
    } catch (_) { /* Not an allowed YouTube page. */ }

    const videoId = String(request.videoId || '');
    if (!authorized || !sender.tab?.id || !VALID_VIDEO_ID.test(videoId)) {
      sendResponse({success: false, error: 'Solicitud de video no válida.'});
      return false;
    }

    (async () => {
      // Una instancia por solicitud impide que dos menús se apropien de la misma pestaña.
      const worker = globalThis.TranscriptTabWorker.create();
      try {
        const result = await worker.getTranscript({videoId});
        return {
          success: true,
          transcript: result.transcript,
          title: result.title || '',
          wordCount: result.wordCount || 0,
          captionLanguage: result.captionLanguage || '',
          videoId
        };
      } catch (error) {
        return {success: false, error: String(error?.message || error || 'Error al extraer transcripción.')};
      } finally {
        await worker.close();
      }
    })().then(sendResponse).catch(error => {
      sendResponse({success: false, error: String(error?.message || error)});
    });
    return true;
  });
})();
