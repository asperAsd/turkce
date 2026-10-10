// Offline support for the app: shell is network-first, audio packs are cached (stale-while-revalidate).
const SHELL='turkce-shell-v1',AUDIO='turkce-audio-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(['./','./manifest.webmanifest','./icon-192.png'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('turkce-')&&k!==SHELL&&k!==AUDIO).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request,u=new URL(req.url);
  if(req.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/')||u.pathname.includes('/pay/')||u.pathname.includes('/auth/'))return;
  if(u.pathname.includes('/audio/')){
    e.respondWith(caches.open(AUDIO).then(async c=>{const hit=await c.match(req);const net=fetch(req).then(r=>{if(r.ok)c.put(req,r.clone());return r}).catch(()=>hit);return hit||net}));return;
  }
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(r=>{const cp=r.clone();caches.open(SHELL).then(c=>c.put('./',cp));return r}).catch(()=>caches.match('./')));return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{if(res.ok&&/\.(png|webp|webmanifest)$/.test(u.pathname)){const cp=res.clone();caches.open(SHELL).then(c=>c.put(req,cp))}return res})));
});
