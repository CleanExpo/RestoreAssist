import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { chromium } = require('playwright');
const repo = fileURLToPath(new URL('..', import.meta.url));
const built = await build({ stdin: { contents: `import * as boundary from './lib/offline/account-boundary'; import * as voice from './lib/voice-note-queue'; import * as nir from './lib/nir-sync-queue'; import * as photos from './lib/evidence-upload-queue'; import * as cache from './lib/offline/job-cache'; window.fixture = { boundary, voice, nir, photos, cache };`, resolveDir: repo }, bundle: true, platform: 'browser', format: 'iife', write: false, tsconfig: `${repo}/tsconfig.json`, alias: {'@': repo} });
const server = createServer((req,res) => { res.setHeader('Content-Type', req.url === '/fixture.js' ? 'application/javascript' : 'text/html'); res.end(req.url === '/fixture.js' ? built.outputFiles[0].text : '<!doctype html><title>Synthetic offline containment</title><script src="/fixture.js"></script>'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const A = { userId: 'synthetic-a', organizationId: 'org-a', workspaceId: 'ws-a', workspaceOwnerId: 'synthetic-a' };
const B = { userId: 'synthetic-b', organizationId: 'org-b', workspaceId: 'ws-b', workspaceOwnerId: 'synthetic-b' };
let owner = A, uploadStatus = 200;
const requests = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/auth/offline-context') return route.fulfill({ status: owner ? 200 : 401, contentType: 'application/json', body: JSON.stringify({ owner }) });
    requests.push({ path: url.pathname, owner: route.request().headers()['x-restoreassist-offline-owner'] });
    return route.fulfill({ status: uploadStatus, contentType: 'application/json', body: JSON.stringify({ transcript: 'synthetic transcript' }) });
  });
  const page = await context.newPage();
  await page.goto(base);
  const login = async (target, scope) => target.evaluate(async scope => { fixture.boundary.setOfflineSession(scope.userId); await fixture.boundary.refreshOfflineOwner(); }, scope);
  await login(page, A);
  await page.evaluate(async () => {
    await fixture.voice.queueVoiceNote(new Blob(['synthetic'], {type:'audio/webm'}), {inspectionId:'synthetic-inspection',fieldLabel:'notes'});
    await fixture.nir.queueWrite({type:'moisture-reading',endpoint:'/api/inspections/synthetic-inspection/moisture',method:'POST',payload:{value:1},inspectionId:'synthetic-inspection'});
    await fixture.cache.cacheJobs([{id:'synthetic-inspection'}]);
    const db=await new Promise(resolve=>{const r=indexedDB.open('ra-voice-note-queue',1);r.onsuccess=()=>resolve(r.result)});
    await new Promise(resolve=>{const r=db.transaction('notes','readwrite').objectStore('notes').put({id:'legacy-note',inspectionId:'legacy-inspection',blob:new Blob(['legacy']),mimeType:'audio/webm',status:'pending',queuedAt:'2020-01-01',retryCount:0});r.onsuccess=resolve});
  });
  owner = B;
  await login(page, B);
  const foreign = await page.evaluate(async () => ({ voices:await fixture.voice.getQueuedVoiceNoteCount(), nir:(await fixture.nir.getPendingEntries()).length, jobs:(await fixture.cache.getCachedJobs()).jobs.length, drained:await fixture.voice.drainVoiceNoteQueue() }));
  assert.deepEqual(foreign,{voices:0,nir:0,jobs:0,drained:0});
  assert.equal(requests.length,0);
  owner=A; await login(page,A);
  const other = await context.newPage(); await other.goto(base); await login(other,A);
  await Promise.all([page.evaluate(()=>fixture.voice.drainVoiceNoteQueue()),other.evaluate(()=>fixture.voice.drainVoiceNoteQueue())]);
  await Promise.all([page.evaluate(()=>fixture.nir.drainQueue()),other.evaluate(()=>fixture.nir.drainQueue())]);
  assert.equal(requests.filter(r=>r.path.includes('voice-note')).length,1);
  assert.equal(requests.filter(r=>r.path.includes('moisture')).length,1);
  assert.ok(requests.every(r=>JSON.parse(decodeURIComponent(r.owner)).userId===A.userId));
  const legacy=await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('ra-voice-note-queue',1);r.onsuccess=()=>resolve(r.result)});return new Promise(resolve=>{const r=db.transaction('notes','readonly').objectStore('notes').get('legacy-note');r.onsuccess=()=>resolve({exists:!!r.result,status:r.result?.status,hasOwner:!!r.result?.owner})})});
  assert.deepEqual(legacy,{exists:true,status:'pending',hasOwner:false});
  await page.reload();
  assert.deepEqual(await page.evaluate(async()=>({owner:fixture.boundary.getOfflineOwner(),notes:await fixture.voice.getQueuedVoiceNoteCount(),replay:await fixture.voice.drainVoiceNoteQueue()})),{owner:null,notes:0,replay:0});
  await login(page,A);
  await page.evaluate(async()=>{
    await fixture.photos.getQueuedEvidenceCount();
    const owner=fixture.boundary.requireOfflineOwner();
    const db=await new Promise(resolve=>{const r=indexedDB.open('ra-evidence-queue',1);r.onsuccess=()=>resolve(r.result)});
    await new Promise(resolve=>{const r=db.transaction('uploads','readwrite').objectStore('uploads').put({id:'preserved-photo',owner,inspectionId:'synthetic-inspection',blob:new Blob(['synthetic']),filename:'synthetic.webp',mimeType:'image/webp',retryCount:0});r.onsuccess=resolve});
  });
  uploadStatus=401;
  assert.equal(await page.evaluate(()=>fixture.photos.drainEvidenceQueue()),0);
  assert.equal(await page.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('ra-evidence-queue',1);r.onsuccess=()=>resolve(r.result)});return new Promise(resolve=>{const r=db.transaction('uploads','readonly').objectStore('uploads').count();r.onsuccess=()=>resolve(r.result)})}),1);
  await other.evaluate(()=>fixture.boundary.clearOfflineContext());
  await page.waitForFunction(()=>fixture.boundary.getOfflineOwner()===null);
  uploadStatus=503;
  await login(page,A);
  const beforeAmbiguous=requests.length;
  await page.evaluate(async()=>{
    await fixture.voice.queueVoiceNote(new Blob(['synthetic ambiguous'],{type:'audio/webm'}),{inspectionId:'synthetic-ambiguous',fieldLabel:'notes'});
    await fixture.voice.drainVoiceNoteQueue();
    await fixture.voice.drainVoiceNoteQueue();
  });
  assert.equal(requests.length-beforeAmbiguous,1);
  uploadStatus=200;
  const sketchRollback=await page.evaluate(async()=>{
    const existing=[];
    for(const [id,label] of [['a-sketch','preserved A'],['b-sketch','preserved B']]) {
      await fixture.nir.queueWrite({id,type:'sketch-save',endpoint:'/api/inspections/shared/sketches',method:'POST',payload:{floorNumber:0,floorLabel:label,clientUpdatedAt:1},inspectionId:'shared'});
      existing.push(id);
    }
    const db=await new Promise(resolve=>{const r=indexedDB.open('nir-offline-queue',1);r.onsuccess=()=>resolve(r.result)});
    const tx=db.transaction('sync-queue','readwrite');
    const store=tx.objectStore('sync-queue');
    const b=await new Promise(resolve=>{const r=store.get('b-sketch');r.onsuccess=()=>resolve(r.result)});
    b.owner={...b.owner,userId:'synthetic-b'};
    await new Promise(resolve=>{const t=db.transaction('sync-queue','readwrite');t.objectStore('sync-queue').put(b);t.oncomplete=resolve});
    const original=IDBIndex.prototype.openCursor;
    IDBIndex.prototype.openCursor=function(...args){
      const request=original.apply(this,args);
      request.addEventListener('success',()=>{
        if(request.result?.value.id==='b-sketch') fixture.boundary.clearOfflineContext();
      });
      return request;
    };
    let rejected=false;
    try { await fixture.nir.enqueueSketchSave('shared',{floorNumber:0,floorLabel:'new A',clientUpdatedAt:2}); }
    catch { rejected=true; }
    finally { IDBIndex.prototype.openCursor=original; }
    const saved=await new Promise(resolve=>{const r=db.transaction('sync-queue','readonly').objectStore('sync-queue').getAll();r.onsuccess=()=>resolve(r.result.filter(row=>row.inspectionId==='shared'))});
    return {rejected,ids:saved.map(row=>row.id).sort(),labels:saved.map(row=>row.payload.floorLabel).sort()};
  });
  assert.deepEqual(sketchRollback,{rejected:true,ids:['a-sketch','b-sketch'],labels:['preserved A','preserved B']});
  const result={status:'PASS',browser:'Chromium',storage:'real IndexedDB',locks:'real cross-tab Web Locks',checks:['A-to-B concealment','same-account resume','cross-tab duplicate suppression','legacy row quarantine','restart fail-closed','photo retained after 401','cross-tab invalidation','ambiguous voice HTTP avoids duplicate dispatch','sketch cursor account change rolls back transaction'],externalRequests:0,syntheticReplayRequests:requests.length};
  await writeFile('/tmp/restoreassist-offline-browser-receipt.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
