import path from 'path';
import os from 'os';
import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia} from '@remotion/renderer';

const entry = path.join(process.cwd(), 'remotion', 'index.tsx');
const dir = path.join(os.homedir(), 'faceless-video', 'restoreassist-industry-promo');
const targets = [
  {id: 'IndustryPromo', file: 'final.mp4'},
  {id: 'IndustryPromoVertical', file: 'final-vertical.mp4'},
];

console.log('[render] bundling…');
const serveUrl = await bundle({entryPoint: entry, onProgress: (p) => p % 25 === 0 && console.log(`[bundle] ${p}%`)});

console.log('[render] resolving compositions…');
const comps = await getCompositions(serveUrl, {inputProps: {}});

for (const t of targets) {
  const comp = comps.find((c) => c.id === t.id);
  if (!comp) throw new Error(`${t.id} not found`);
  const out = path.join(dir, t.file);
  console.log(`[render] ${comp.id} ${comp.width}x${comp.height} ${comp.durationInFrames}f @${comp.fps}fps → ${t.file}`);
  let last = 0;
  await renderMedia({
    composition: comp,
    serveUrl,
    codec: 'h264',
    outputLocation: out,
    overwrite: true,
    onProgress: ({progress}) => {
      const pct = Math.round(progress * 100);
      if (pct >= last + 20) {(last = pct); console.log(`[${t.id}] ${pct}%`);}
    },
  });
  console.log(`[render] ✓ ${out}`);
}
console.log('[render] all done');
