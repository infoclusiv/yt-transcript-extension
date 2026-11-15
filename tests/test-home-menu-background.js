/* node tests/test-home-menu-background.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const filename = path.resolve(__dirname, '../home-menu/background.js');

function harness(impl) {
  let listener = null;
  const objects = {created: 0, closed: 0, requests: []};
  const sandbox = {
    URL,
    chrome: {runtime: {onMessage: {addListener: fn => {listener = fn;}}}},
    TranscriptTabWorker: {create() {
      objects.created++;
      return {
        async getTranscript(request) { objects.requests.push(request); return impl(request); },
        async close() { objects.closed++; }
      };
    }}
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
  async function call(request, sender = {tab: {id: 7, url: 'https://www.youtube.com/'}}) {
    return await new Promise((resolve, reject) => {
      const type = listener(request, sender, resolve);
      if (type === false && request.action !== 'extractHomeMenuTranscript') resolve({ignored: true});
    });
  }
  return {call, objects};
}

(async () => {
  let h = harness(async ({videoId}) => ({success: true, transcript: `Text ${videoId}`, title: 'Video', wordCount: 2}));
  const response = await h.call({action: 'extractHomeMenuTranscript', videoId: 'abcdefghijk'});
  assert.equal(response.success, true);
  assert.equal(response.transcript, 'Text abcdefghijk');
  assert.equal(h.objects.created, 1);
  assert.equal(h.objects.closed, 1);
  assert.equal(h.objects.requests[0].videoId, 'abcdefghijk');
  console.log('PASS: existing worker called and temporary tab closed');

  h = harness(async () => {throw new Error('No captions found');});
  const error = await h.call({action: 'extractHomeMenuTranscript', videoId: 'abcdefghijk'});
  assert.equal(error.success, false);
  assert.match(error.error, /No captions/);
  assert.equal(h.objects.closed, 1);
  console.log('PASS: errors clean up worker');

  h = harness(async () => ({success: true, transcript: 'test'}));
  const denied = await h.call({action: 'extractHomeMenuTranscript', videoId: 'abcdefghijk'},
    {tab: {id: 4, url: 'https://example.com/'}});
  assert.equal(denied.success, false);
  const invalid = await h.call({action: 'extractHomeMenuTranscript', videoId: '../../etc'});
  assert.equal(invalid.success, false);
  assert.equal(h.objects.created, 0);
  console.log('PASS: video-ID validation and sender origin validation');
})().catch(err => {console.error(err); process.exitCode = 1;});
