import {renderMedia, getCompositions} from '@remotion/renderer';
import path from 'path';

const compositionsToRender = [
  {id: 'DashboardWalkthrough', durationInFrames: 900, fileName: 'dashboard-walkthrough.mp4'},
  {id: 'CreateInspection', durationInFrames: 1200, fileName: 'create-inspection.mp4'},
  {id: 'ReportBuilder', durationInFrames: 1050, fileName: 'report-builder.mp4'},
  {id: 'ClientPortal', durationInFrames: 900, fileName: 'client-portal.mp4'},
];

async function renderAll() {
  const entry = path.join(process.cwd(), 'remotion', 'index.tsx');
  const bundled = `@remotion/bundler`;
  const bundleLocation = path.join(process.cwd(), 'remotion-bundle');

  console.log('[render] bundling Remotion project...');
  const {bundle} = await import('@remotion/bundler');
  const bundleLocationResult = await bundle({
    entryPoint: entry,
    onProgress: (progress) => {
      console.log(`[bundle] ${Math.round(progress * 100)}%`);
    },
  });

  console.log('[render] getting compositions...');
  const comps = await getCompositions(bundleLocationResult, {inputProps: {}});

  for (const compInfo of compositionsToRender) {
    const comp = comps.find((c) => c.id === compInfo.id);
    if (!comp) {
      console.error(`[render] composition ${compInfo.id} not found`);
      continue;
    }

    const outputPath = path.join(process.cwd(), 'public', 'videos', 'help', compInfo.fileName);
    console.log(`[render] rendering ${compInfo.id} → ${outputPath}`);

    await renderMedia({
      composition: comp,
      serveUrl: bundleLocationResult,
      codec: 'h264',
      outputLocation: outputPath,
      onProgress: ({progress}) => {
        console.log(`[${compInfo.id}] ${Math.round(progress * 100)}%`);
      },
      overwrite: true,
    });

    console.log(`[render] ✓ ${compInfo.id} complete`);
  }

  console.log('[render] all done');
}

renderAll().catch((err) => {
  console.error('[render] fatal error:', err);
  process.exit(1);
});
