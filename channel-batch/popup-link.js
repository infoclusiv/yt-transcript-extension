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
