"""Simulated legacy and modern YouTube DOMs; production code is never modified."""
import asyncio
import re
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
HTML = '''<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>
body{font:14px Arial}ytd-rich-item-renderer,yt-lockup-view-model,ytd-rich-grid-media{display:block;margin:20px} 
ytd-popup-container{display:block}tp-yt-iron-dropdown{display:none;position:fixed;left:280px;top:100px;width:280px;background:#fff;border:1px solid black;z-index:9}
ytd-menu-popup-renderer, yt-sheet-view-model,yt-list-view-model,#items{display:block;min-height:32px}
yt-list-item-view-model,ytd-menu-service-item-renderer{display:block;min-height:48px}
</style></head><body>
<ytd-rich-item-renderer><yt-lockup-view-model id="new-card-a">
<a class="ytLockupViewModelContentImage" href="/watch?v=abcdefghijk">Video nuevo A</a>
<yt-lockup-metadata-view-model><div class="ytLockupMetadataViewModelMenuButton"><button id="new-a" aria-label="More actions">⋮</button></div></yt-lockup-metadata-view-model>
</yt-lockup-view-model></ytd-rich-item-renderer>
<ytd-rich-item-renderer><yt-lockup-view-model id="new-card-b">
<a class="ytLockupViewModelContentImage" href="/watch?v=ABCDEFGHIJK">Video nuevo B</a>
<yt-lockup-metadata-view-model><div class="ytLockupMetadataViewModelMenuButton"><button id="new-b" aria-label="More actions">⋮</button></div></yt-lockup-metadata-view-model>
</yt-lockup-view-model></ytd-rich-item-renderer>
<ytd-rich-grid-media><a id="video-title-link" href="/watch?v=123456789ab">Video clásico</a>
<ytd-menu-renderer><button id="legacy" aria-label="Action menu">⋮</button></ytd-menu-renderer></ytd-rich-grid-media>
<button id="other">Otro menú</button>
<ytd-popup-container><tp-yt-iron-dropdown id="dropdown"></tp-yt-iron-dropdown></ytd-popup-container>
<script>
window._calls=[]; window._copied=[];
window.chrome={runtime:{sendMessage:async req=>{
  window._calls.push(req);return {success:true,transcript:'Transcripción de '+req.videoId};
}}};
window.TranscriptClipboard={writeText:async text=>window._copied.push(text)};
function show(type) {
 let dd=document.querySelector('#dropdown');
 if(type==='new')dd.innerHTML='<yt-sheet-view-model><yt-list-view-model><yt-list-item-view-model>Save to Watch Later</yt-list-item-view-model><yt-list-item-view-model>Share</yt-list-item-view-model></yt-list-view-model></yt-sheet-view-model>';
 else if(type==='legacy') dd.innerHTML='<ytd-menu-popup-renderer><div id="items"><ytd-menu-service-item-renderer>Save to Watch Later</ytd-menu-service-item-renderer></div></ytd-menu-popup-renderer>';
 else dd.innerHTML='<yt-sheet-view-model><yt-list-view-model><yt-list-item-view-model>Other menu</yt-list-item-view-model></yt-list-view-model></yt-sheet-view-model>';
 dd.style.display='block';
}
for(let id of ['new-a','new-b']) document.getElementById(id).addEventListener('click',()=>show('new'));
document.getElementById('legacy').addEventListener('click',()=>show('legacy'));
document.getElementById('other').addEventListener('click',()=>show('other'));
</script></body></html>'''

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page=await browser.new_page()
  await page.set_content(HTML)
  await page.add_style_tag(path=str(ROOT/'home-menu/home-menu.css'))
  script = (ROOT/'home-menu/home-menu.js').read_text()
  # Local about:blank fixture only: route checks replaced without changing built JS.
  script = re.sub(r"function isHome\(\) \{.*?\n  \}", "function isHome() { return true; }", script, count=1, flags=re.S)
  script = script.replace("new URL(href, location.origin)", "new URL(href, 'https://www.youtube.com')")
  await page.add_script_tag(content=script)
  assert await page.evaluate('document.documentElement.dataset.ytTranscriptMenuVersion') == '1.7.9'
  await page.click('#new-a')
  await page.locator('.transcript-home-menu-item').wait_for(timeout=5000)
  assert await page.locator('.transcript-home-menu-item').count() == 1
  assert await page.locator('.transcript-home-menu-item').inner_text() == 'Copiar transcripción'
  assert await page.locator('.transcript-home-menu-item').evaluate('(el)=>el.parentElement.tagName') == 'YT-LIST-VIEW-MODEL'
  await page.click('.transcript-home-menu-item')
  await page.wait_for_function('window._copied.length === 1')
  assert await page.evaluate('window._copied[0]') == 'Transcripción de abcdefghijk'
  print('PASS: new 2026 Lockup + Sheet/ListViewModel menu, correct video and clipboard')

  await page.click('#new-b')
  await page.locator('.transcript-home-menu-item').wait_for(timeout=5000)
  await page.click('.transcript-home-menu-item')
  await page.wait_for_function('window._copied.length === 2')
  assert await page.evaluate('window._copied[1]') == 'Transcripción de ABCDEFGHIJK'
  print('PASS: other Lockup selects its own video ID')

  await page.click('#legacy')
  await page.locator('.transcript-home-menu-item').wait_for(timeout=5000)
  await page.click('.transcript-home-menu-item')
  await page.wait_for_function('window._copied.length === 3')
  assert await page.evaluate('window._copied[2]') == 'Transcripción de 123456789ab'
  print('PASS: classic YTD popup still supported')

  await page.click('#new-a')
  await page.locator('.transcript-home-menu-item').wait_for(timeout=5000)
  await page.click('#other')
  await page.wait_for_timeout(150)
  assert await page.locator('.transcript-home-menu-item').count() == 0
  print('PASS: unrelated menu never inherits previous video context')

  await page.evaluate('window.chrome.runtime.sendMessage=async req=>({success:false,error:"No subtitles for video"})')
  await page.click('#new-b')
  await page.locator('.transcript-home-menu-item').wait_for(timeout=5000)
  await page.click('.transcript-home-menu-item')
  await page.wait_for_function('document.querySelector(".transcript-home-toast")?.dataset.state === "error"')
  assert 'No subtitles' in await page.locator('.transcript-home-toast').inner_text()
  print('PASS: errors are reported, no false copy success')

  await browser.close()

asyncio.run(main())
