document.getElementById('channelBatchOpen')?.addEventListener('click', async () => {
  await chrome.tabs.create({url:chrome.runtime.getURL('channel-batch/channel-batch.html')});
  window.close();
});

document.getElementById('linkBatchOpen')?.addEventListener('click', async () => {
  await chrome.tabs.create({url:chrome.runtime.getURL('links-batch/links-batch.html')});
  window.close();
});

document.getElementById('watchLaterOpen')?.addEventListener('click', async () => {
  await chrome.tabs.create({url:chrome.runtime.getURL('watch-later/watch-later.html')});
  window.close();
});

document.getElementById('channelLinksOpen')?.addEventListener('click', async () => {
  const tab = (await chrome.tabs.query({active:true,currentWindow:true}))[0];
  if(tab?.id && /(^|\.)youtube\.com$/.test(new URL(tab.url||'https://invalid.example').hostname))
    await chrome.storage.local.set({ytTranscriptLinksSourceTab:tab.id});
  await chrome.tabs.create({url:chrome.runtime.getURL('channel-links/collector.html')});
  window.close();
});
