/**
 * @file remotion/compositions/industry-promo.tsx
 * IndustryPromo — 53.5s cinematic-branded promo to the Professional Restoration Industry.
 * Voiceover: ElevenLabs (public/industry-promo/voiceover.mp3). Copy grounded in lib/brand.ts
 * spine-locked positioning; IICRC/WHS/Building Code referenced by name only (verbatim gate).
 * Beat timings derived from the VO character alignment (see ~/faceless-video/.../beats.json).
 */
import React from 'react';
import {
  AbsoluteFill, Audio, Sequence, Img, staticFile,
  interpolate, spring, useCurrentFrame, useVideoConfig,
} from 'remotion';
import {RA, RA_FONTS} from '../lib/brand';

const FPS = 30;
const URL = 'restoreassist.app';

// Beats: [startSec, durSec]. Frames computed at render fps.
const B = {
  hook:    [0.0,  3.62],
  field:   [3.62, 3.54],
  rekey:   [7.16, 2.30],
  frag:    [9.46, 5.65],
  reveal:  [15.12, 8.53],
  oneSys:  [23.65, 3.00],
  comply:  [26.64, 5.96],
  docs:    [32.60, 3.54],
  ai:      [36.14, 4.98],
  aunz:    [41.12, 4.82],
  slogan:  [45.94, 5.08],
  cta:     [51.02, 2.43],
} as const;
const f = (s: number) => Math.round(s * FPS);
const seq = ([start, dur]: readonly [number, number] | number[]) =>
  ({from: f(start), durationInFrames: f(dur) + 1});

const GRAD = `radial-gradient(120% 120% at 50% 0%, ${RA.navyLight} 0%, ${RA.navy} 42%, ${RA.bgDark} 100%)`;

/** Fade+rise entrance driven by local (Sequence-relative) frame. */
const useRise = (delay = 0, dist = 28) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - delay, fps, config: {damping: 200}});
  return {opacity: interpolate(s, [0, 1], [0, 1]), transform: `translateY(${interpolate(s, [0, 1], [dist, 0])}px)`};
};

const Logo: React.FC<{scale?: number}> = ({scale = 1}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 12 * scale}}>
    <div style={{width: 44 * scale, height: 44 * scale, borderRadius: 12 * scale, background: RA.warm,
      display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <Img src={staticFile('logo.png')} style={{width: 30 * scale, height: 'auto'}} />
    </div>
    <div style={{fontSize: 22 * scale, fontWeight: 800, color: RA.textPrimary, letterSpacing: -0.5}}>RestoreAssist</div>
  </div>
);

/** Persistent brand chrome: small logo top-left, url bottom-right. */
const Chrome: React.FC = () => (
  <>
    <div style={{position: 'absolute', top: 44, left: 52, opacity: 0.92}}><Logo scale={0.8} /></div>
    <div style={{position: 'absolute', bottom: 44, right: 56, fontSize: 18, fontWeight: 600, color: RA.textMuted}}>{URL}</div>
  </>
);

/** Product screenshot in a soft browser frame. */
const Shot: React.FC<{name: string; delay?: number; w?: number}> = ({name, delay = 6, w = 760}) => {
  const r = useRise(delay, 40);
  return (
    <div style={{...r, width: w, borderRadius: 16, overflow: 'hidden', border: `1px solid ${RA.border}`,
      boxShadow: '0 40px 90px rgba(0,0,0,0.55)', background: RA.bgCard}}>
      <div style={{height: 34, background: RA.surface, display: 'flex', alignItems: 'center', gap: 7, paddingLeft: 14}}>
        {['#ef4444', '#f59e0b', '#22c55e'].map((c) => (
          <div key={c} style={{width: 11, height: 11, borderRadius: 6, background: c, opacity: 0.7}} />
        ))}
      </div>
      <Img src={staticFile(`screenshots/ra-ui/${name}`)} style={{width: '100%', display: 'block'}} />
    </div>
  );
};

/** Fade+rise wrapper so map()ed items don't call hooks in a loop (rules-of-hooks). */
const Fade: React.FC<{delay?: number; dist?: number; style?: React.CSSProperties; children: React.ReactNode}> = ({delay = 0, dist = 28, style, children}) => {
  const r = useRise(delay, dist);
  return <div style={{...r, ...style}}>{children}</div>;
};

const Chip: React.FC<{children: React.ReactNode; muted?: boolean; delay?: number}> = ({children, muted, delay = 0}) => {
  const r = useRise(delay);
  return (
    <div style={{...r, padding: '12px 22px', borderRadius: 999, fontSize: 26, fontWeight: 700,
      color: muted ? RA.textMuted : RA.textPrimary,
      background: muted ? 'rgba(255,255,255,0.04)' : 'rgba(138,107,78,0.18)',
      border: `1px solid ${muted ? RA.border : RA.warm}`}}>{children}</div>
  );
};

const Center: React.FC<{children: React.ReactNode; gap?: number}> = ({children, gap = 18}) => (
  <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap,
    fontFamily: RA_FONTS.heading, textAlign: 'center', padding: 90}}>{children}</AbsoluteFill>
);

/* ---- beat cards ---- */

const Hook = () => {
  const a = useRise(0), b = useRise(14);
  return (<Center gap={10}>
    <div style={{...a, fontSize: 78, fontWeight: 800, color: RA.textPrimary, lineHeight: 1.05}}>Restoration doesn't wait.</div>
    <div style={{...b, fontSize: 60, fontWeight: 700, color: RA.warmLight, lineHeight: 1.1}}>But the paperwork always does.</div>
  </Center>);
};

const Field = () => {
  const a = useRise(0), b = useRise(12);
  return (<Center>
    <div style={{...a, fontSize: 34, fontWeight: 600, color: RA.textMuted}}>Every job runs the same way</div>
    <div style={{...b, fontSize: 66, fontWeight: 800, color: RA.textPrimary}}>You capture it in the field…</div>
  </Center>);
};

const Rekey = () => {
  const items = ['Field capture', 're-key', 'Office'];
  return (<Center>
    <div style={{display: 'flex', alignItems: 'center', gap: 26}}>
      {items.map((t, i) => (
        <React.Fragment key={t}>
          <Chip delay={i * 6} muted={i === 1}>{t}</Chip>
          {i < items.length - 1 && <div style={{fontSize: 40, color: RA.warm}}>→</div>}
        </React.Fragment>
      ))}
    </div>
    <div style={{...useRise(20), fontSize: 30, color: RA.textMuted, marginTop: 10}}>…then type it all again back at the office.</div>
  </Center>);
};

const Frag = () => {
  const cards = ['Photos in one app', 'Scope in another', 'Compliance chased later'];
  return (<Center>
    <div style={{...useRise(0), fontSize: 30, fontWeight: 600, color: RA.textMuted}}>Fragmented tools, every claim</div>
    <div style={{display: 'flex', gap: 20, marginTop: 8}}>
      {cards.map((c, i) => (
        <Fade key={c} delay={6 + i * 8} dist={34}>
          <div style={{width: 300, height: 150, borderRadius: 16,
            background: 'rgba(255,255,255,0.04)', border: `1px dashed ${RA.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22,
            fontSize: 26, fontWeight: 700, color: RA.textMuted, textAlign: 'center',
            transform: `rotate(${(i - 1) * 3}deg)`}}>{c}</div>
        </Fade>
      ))}
    </div>
  </Center>);
};

const Reveal = () => {
  const logo = useRise(0), l1 = useRise(24), l2 = useRise(60), l3 = useRise(120);
  return (<Center gap={22}>
    <div style={logo}><Logo scale={1.9} /></div>
    <div style={{...l1, fontSize: 34, fontWeight: 600, color: RA.warmLight, maxWidth: 1200, lineHeight: 1.3}}>
      Australia's first Australian-designed CRM built specifically for the restoration industry.
    </div>
    <div style={{...l2, fontSize: 58, fontWeight: 800, color: RA.textPrimary}}>Office and Field. One System.</div>
    <div style={{...l3, fontSize: 26, color: RA.textMuted}}>No double-handling.</div>
  </Center>);
};

const OneSys = () => {
  const {width, height} = useVideoConfig();
  const p = height > width;
  return (
    <AbsoluteFill style={{flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 40 : 54, padding: 90, fontFamily: RA_FONTS.heading, textAlign: p ? 'center' : 'left'}}>
      <div style={{...useRise(0), maxWidth: 640}}>
        <div style={{fontSize: 58, fontWeight: 800, color: RA.textPrimary, lineHeight: 1.1}}>Office and field.</div>
        <div style={{fontSize: 58, fontWeight: 800, color: RA.warmLight, lineHeight: 1.1}}>One system.</div>
        <div style={{fontSize: 28, color: RA.textMuted, marginTop: 18}}>Capture once. See it everywhere.</div>
      </div>
      <Shot name="dashboard.png" w={p ? 880 : 760} />
    </AbsoluteFill>
  );
};

const Comply = () => {
  const {width, height} = useVideoConfig();
  const p = height > width;
  return (
    <AbsoluteFill style={{flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 40 : 54, padding: 90, fontFamily: RA_FONTS.heading, textAlign: p ? 'center' : 'left'}}>
      <Shot name="compliance-checklists.png" w={p ? 880 : 760} />
      <div style={{maxWidth: p ? 780 : 430}}>
        <div style={{...useRise(0), fontSize: 48, fontWeight: 800, color: RA.textPrimary, lineHeight: 1.12}}>Compliance, built in.</div>
        <div style={{marginTop: 22, display: 'flex', flexDirection: 'column', gap: 12, alignItems: p ? 'center' : 'flex-start'}}>
          {['IICRC frameworks', 'WHS policies', 'Building Code references'].map((t, i) => (
            <Chip key={t} delay={10 + i * 8}>{t}</Chip>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Docs = () => {
  const {width, height} = useVideoConfig();
  const p = height > width;
  return (
    <AbsoluteFill style={{flexDirection: p ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: p ? 40 : 54, padding: 90, fontFamily: RA_FONTS.heading, textAlign: p ? 'center' : 'left'}}>
      <div style={{...useRise(0), maxWidth: 640}}>
        <div style={{fontSize: 52, fontWeight: 800, color: RA.textPrimary, lineHeight: 1.1}}>Claim-ready</div>
        <div style={{fontSize: 52, fontWeight: 800, color: RA.warmLight, lineHeight: 1.1}}>the first time.</div>
        <div style={{fontSize: 28, color: RA.textMuted, marginTop: 18}}>Insurer-aligned documentation, straight from the field.</div>
      </div>
      <Shot name="report-builder.png" w={p ? 880 : 760} />
    </AbsoluteFill>
  );
};

const AI = () => {
  const a = useRise(0), b = useRise(16), c = useRise(34);
  return (<Center gap={14}>
    <div style={{...a, fontSize: 66, fontWeight: 800, color: RA.textPrimary}}>AI assists your team.</div>
    <div style={{...b, fontSize: 44, fontWeight: 700, color: RA.warmLight}}>Every decision stays with you.</div>
    <div style={{...c, marginTop: 14, padding: '12px 26px', borderRadius: 999, border: `1px solid ${RA.warm}`,
      background: 'rgba(138,107,78,0.18)', fontSize: 24, fontWeight: 700, color: RA.textPrimary}}>Assists — never replaces</div>
  </Center>);
};

const AUNZ = () => {
  const a = useRise(0), b = useRise(16);
  return (<Center gap={16}>
    <div style={{...a, fontSize: 56, fontWeight: 800, color: RA.textPrimary}}>Designed in Australia.</div>
    <div style={{...b, fontSize: 40, fontWeight: 700, color: RA.warmLight}}>Deployed across Australia &amp; New Zealand.</div>
  </Center>);
};

const Slogan = () => {
  const parts = ['One System.', 'Fewer Gaps.', 'More Confidence.'];
  return (<Center gap={6}>
    {parts.map((p, i) => (
      <Fade key={p} delay={i * 14}>
        <div style={{fontSize: 72, fontWeight: 800,
          color: i === 2 ? RA.warmLight : RA.textPrimary, lineHeight: 1.08}}>{p}</div>
      </Fade>
    ))}
  </Center>);
};

const CTA = () => (
  <Center gap={22}>
    <div style={useRise(0)}><Logo scale={1.7} /></div>
    <div style={{...useRise(12), fontSize: 34, color: RA.textMuted}}>See how it works</div>
    <div style={{...useRise(20), fontSize: 52, fontWeight: 800, color: RA.warmLight}}>{URL}</div>
  </Center>
);

export const IndustryPromo: React.FC = () => (
  <AbsoluteFill style={{background: GRAD}}>
    <Audio src={staticFile('industry-promo/voiceover.mp3')} />
    <Audio src={staticFile('industry-promo/music.mp3')} volume={0.18} />
    <Sequence {...seq(B.hook)}><Hook /></Sequence>
    <Sequence {...seq(B.field)}><Field /></Sequence>
    <Sequence {...seq(B.rekey)}><Rekey /></Sequence>
    <Sequence {...seq(B.frag)}><Frag /></Sequence>
    <Sequence {...seq(B.reveal)}><Reveal /></Sequence>
    <Sequence {...seq(B.oneSys)}><OneSys /></Sequence>
    <Sequence {...seq(B.comply)}><Comply /></Sequence>
    <Sequence {...seq(B.docs)}><Docs /></Sequence>
    <Sequence {...seq(B.ai)}><AI /></Sequence>
    <Sequence {...seq(B.aunz)}><AUNZ /></Sequence>
    <Sequence {...seq(B.slogan)}><Slogan /></Sequence>
    <Sequence {...seq(B.cta)}><CTA /></Sequence>
    <Chrome />
  </AbsoluteFill>
);
