// Mobile performance (slow phone: CPU 4×, 1.6 Mb/s, 150 ms RTT) — copy of scripts/kratkerecenze/perf_mobil.js with optional
// PERF_HEADERS (JSON) for staging behind Access.  node scripts/perf-mobile.cjs URL [URL…]
// Mobilní měření kratkerecenze.cz: simulovaný pomalý telefon (CPU 4×, 1,6 Mb/s, 150 ms RTT), čistý profil, zahřátá CF cache.
// Použití: node scripts/kratkerecenze/perf_mobil.js URL [URL…]  → TTFB, FCP/LCP, TBT, CLS, požadavky, render-blokující zdroje.
const H=process.env.PERF_HEADERS?JSON.parse(process.env.PERF_HEADERS):null;
const p=require('/home/kenny/ai/node_modules/puppeteer-core');
(async()=>{const b=await p.launch({executablePath:'/usr/bin/chromium',headless:'new',args:['--no-sandbox','--disable-dev-shm-usage']});
for(const u of process.argv.slice(2)){
 // zahřátí CF cache
 const w=await b.newPage();if(H)await w.setExtraHTTPHeaders(H);await w.goto(u,{waitUntil:'networkidle2',timeout:60000});await w.close();
 const ctx=await b.createBrowserContext();const pg=await ctx.newPage();if(H)await pg.setExtraHTTPHeaders(H);const cdp=await pg.createCDPSession();
 await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8});
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await pg.setUserAgent('Mozilla/5.0 (Linux; Android 11; Moto G Power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36');
 await pg.setViewport({width:412,height:823,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await pg.evaluateOnNewDocument(()=>{window.__lt=[];window.__lcp=0;window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([e.startTime,e.duration])}).observe({type:'longtask',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});});
 const t0=Date.now();await pg.goto(u,{waitUntil:'load',timeout:90000});await new Promise(r=>setTimeout(r,5000));
 const r=await pg.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];const fcp=performance.getEntriesByName('first-contentful-paint')[0];
  const res=performance.getEntriesByType('resource').map(e=>({n:e.name.replace(/https?:\/\/[^/]+/,'').slice(0,70),t:e.initiatorType,s:Math.round(e.transferSize/1024),d:Math.round(e.duration),st:Math.round(e.startTime),rb:e.renderBlockingStatus}));
  const tbt=window.__lt.filter(x=>x[0]>(fcp?fcp.startTime:0)).reduce((a,x)=>a+Math.max(0,x[1]-50),0);
  return {ttfb:Math.round(n.responseStart),fcp:fcp&&Math.round(fcp.startTime),lcp:Math.round(window.__lcp),tbt:Math.round(tbt),cls:+window.__cls.toFixed(3),dcl:Math.round(n.domContentLoadedEventEnd),load:Math.round(n.loadEventEnd),reqs:res.length+1,kb:Math.round((res.reduce((a,x)=>a+x.s,0)+n.transferSize/1024)),html:Math.round(n.encodedBodySize/1024),blocking:res.filter(x=>x.rb==='blocking'),top:res.sort((a,b)=>b.s-a.s).slice(0,8)}});
 console.log('\n###',u);console.log(JSON.stringify({...r,blocking:undefined,top:undefined}));console.log('blocking:',r.blocking.map(x=>x.n+' '+x.s+'kB '+x.d+'ms').join(' | '));console.log('top:',r.top.map(x=>x.n+' '+x.s+'kB').join(' | '));
 await ctx.close();}
await b.close();})();
