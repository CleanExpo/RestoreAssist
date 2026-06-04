const fs = require('fs');
const path = require('path');
const https = require('https');

const NARRATION_SCRIPTS = {
  'hero-product-overview': `Welcome to RestoreAssist. The [truncated] software for restoration professionals. Everything in one place. Integrate with your existing tools. Generate professional reports in minutes. Stay compliant with every inspection. Ready to digitise your workflow? Start your free trial at restoreassist.com.au.`,
  'setup-wizard-full': `Welcome to RestoreAssist. This is your complete setup walkthrough. Step one, create your account with your email and company details. Step two, configure your company profile, trade category, and ABN. Step three, connect your tools — Accounting, CRM, and Calendar. Step four, create your first inspection with evidence capture and a compliance checklist. Step five, build and export a branded PDF report. Step six, invite your team members and assign roles. Your dashboard gives you a unified view of everything. Setup complete.`,
  'settings-config': `Your RestoreAssist settings dashboard. Update your profile, configure company branding, and manage notification preferences. Connect integrations and control team permissions. Everything you need to customise your workflow is here.`,
  'integration-connect': `Integrate RestoreAssist with the tools you already rely on. Connect your accounting software for automatic invoicing. Link your CRM for seamless client management. Sync your calendar so no appointment is ever missed. Your workflow, unified.`,
  'report-export-pdf': `Generate professional branded reports in seconds. Choose your export format — PDF, Word, or CSV. Selecting PDF with company branding automatically applies your logo, colours, and technician certification details. IICRC standard references are built into every report. Export complete.`,
};

const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const OUT_DIR = 'remotion/assets/narration';

function generate(scriptKey, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      port: 443,
      path: `/v1/text-to-speech/${VOICE_ID}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      if (res.statusCode !== 200) {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${d}`)));
        return;
      }
      const fp = path.join(OUT_DIR, `${scriptKey}.mp3`);
      const ws = fs.createWriteStream(fp);
      res.pipe(ws);
      ws.on('finish', () => { console.log(`[OK] ${scriptKey}.mp3`); resolve(fp); });
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  if (!API_KEY || !VOICE_ID) { console.error('Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID'); process.exit(1); }
  fs.mkdirSync(OUT_DIR, {recursive: true});
  for (const [key, text] of Object.entries(NARRATION_SCRIPTS)) {
    try { await generate(key, text); } catch (e) { console.error(`[FAIL] ${key}: ${e.message}`); }
  }
})();
