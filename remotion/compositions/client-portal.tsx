// @ts-nocheck
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const ClientPortal = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0, d1, d2, d3, d4] = stepDurations;
  const s0 = 0, s1 = s0 + d0, s2 = s1 + d1, s3 = s2 + d2, s4 = s3 + d3, s5 = s4 + d4;

  const introOpacity = interpolate(frame, [s0, s0 + 20, s1 - 20, s1], [1, 1, 1, 0]);
  const outroOpacity = interpolate(frame, [s5, s5 + 10, s5 + 25, s5 + 40], [0, 1, 1, 1]);
  const mainOpacity = interpolate(frame, [s1 - 10, s1], [0, 1]);

  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', inset: 0, opacity: introOpacity, zIndex: introOpacity > 0 ? 100 : 0}}>
        <IntroSlide title={title} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: mainOpacity, zIndex: 10}}>
        <ScreenContainer>
          <div style={{display: 'flex', flexDirection: 'column', width: '100%', height: '100%'}}>
            <TopBar />

            <div style={{flex: 1, overflow: 'auto', position: 'relative'}}>
              {/* Step 1: Report list */}
              {frame >= s1 && frame < s2 && (
                <div style={{padding: 32, maxWidth: 900, margin: '0 auto'}}>
                  <h1 style={{fontSize: 26, fontWeight: 700, color: '#1e293b', margin: '0 0 24px', fontFamily: 'system-ui'}}>Reports Ready for Sharing</h1>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                    {[
                      {id: 'RPT-2026-0189', title: 'Water Damage — Kitchen', client: 'Mrs Jane Smith', status: 'Ready', date: '2 Jun 2026'},
                      {id: 'RPT-2026-0188', title: 'Fire & Smoke — Living Room', client: 'Mr John Davis', status: 'Draft', date: '1 Jun 2026'},
                    ].map((r, i) => (
                      <div key={r.id} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: 20,
                        borderRadius: 12,
                        backgroundColor: i === 0 ? '#ffffff' : '#f8fafc',
                        border: '1px solid ' + (i === 0 ? '#e2e8f0' : '#f1f5f9'),
                      }}>
                        <div>
                          <div style={{fontSize: 12, color: '#94a3b8', fontFamily: 'system-ui'}}>{r.id}</div>
                          <div style={{fontSize: 16, fontWeight: 600, color: '#334155', fontFamily: 'system-ui', marginTop: 4}}>{r.title}</div>
                          <div style={{fontSize: 13, color: '#64748b', fontFamily: 'system-ui', marginTop: 4}}>{r.client} · {r.date}</div>
                        </div>
                        <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                          <span style={{
                            padding: '6px 16px',
                            borderRadius: 12,
                            backgroundColor: i === 0 ? '#dcfce7' : '#fef3c7',
                            color: i === 0 ? '#166534' : '#92400e',
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: 'system-ui',
                          }}>{r.status}</span>
                          <button style={{
                            padding: '10px 20px',
                            borderRadius: 8,
                            border: 'none',
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: 'system-ui',
                            cursor: 'pointer',
                          }}>{i === 0 ? 'Share' : 'Generate'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Share dialog */}
              {frame >= s2 && frame < s3 && (
                <div style={{position: 'absolute', inset: 0, backgroundColor: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100}}>
                  <div style={{
                    width: 520,
                    backgroundColor: '#ffffff',
                    borderRadius: 16,
                    padding: 32,
                    boxShadow: '0 25px 80px rgba(0,0,0,0.3)',
                  }}>
                    <h2 style={{fontSize: 22, fontWeight: 700, color: '#1e293b', margin: '0 0 8px', fontFamily: 'system-ui'}}>Share with Client</h2>
                    <p style={{fontSize: 14, color: '#64748b', margin: '0 0 24px', fontFamily: 'system-ui'}}>Mrs Jane Smith will receive a secure link to view this report.</p>
                    <div style={{
                      padding: 16,
                      borderRadius: 8,
                      backgroundColor: '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 24,
                    }}>
                      <code style={{fontSize: 13, color: '#334155', fontFamily: 'monospace'}}>https://restoreassist.app/portal/r/reSkx9...</code>
                      <span style={{fontSize: 13, color: '#059669', fontWeight: 600}}>Copied</span>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'flex-end', gap: 12}}>
                      <button style={{padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#334155', fontSize: 14, fontWeight: 600, fontFamily: 'system-ui'}}>Close</button>
                      <button style={{padding: '10px 20px', borderRadius: 8, border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'system-ui'}}>Send via Email</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Client portal view */}
              {frame >= s3 && frame < s5 && (
                <div style={{padding: 32, maxWidth: 800, margin: '0 auto', fontFamily: 'system-ui'}}>
                  <div style={{textAlign: 'center', marginBottom: 32}}>
                    <div style={{width:64, height:64, borderRadius: 16, backgroundColor: '#dc2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 16}}>🏗</div>
                    <h1 style={{fontSize: 24, fontWeight: 700, color: '#1e293b', margin: 0}}>RestoreAssist Client Portal</h1>
                    <p style={{fontSize: 14, color: '#64748b', marginTop: 8}}>Secure report access for Mrs Jane Smith</p>
                  </div>

                  <div style={{
                    borderRadius: 16,
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                  }}>
                    <div style={{padding: 24, borderBottom: '1px solid #e2e8f0'}}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                        <div>
                          <div style={{fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'}}>Report ID: RPT-2026-0189</div>
                          <h2 style={{fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '4px 0 0'}}>Water Damage — Kitchen</h2>
                          <p style={{fontSize: 14, color: '#64748b', margin: '4px 0 0'}}>42 Example Street, Sydney NSW 2000</p>
                        </div>
                        <span style={{
                          padding: '6px 16px',
                          borderRadius: 12,
                          backgroundColor: '#dcfce7',
                          color: '#166534',
                          fontSize: 12,
                          fontWeight: 600,
                        }}>Final</span>
                      </div>
                    </div>

                    <div style={{padding: 24}}>
                      <h3 style={{fontSize: 15, fontWeight: 600, color: '#334155', margin: '0 0 12px'}}>Executive Summary</h3>
                      <p style={{fontSize: 14, color: '#475569', lineHeight: 1.7, margin: 0}}>
                        Water damage event at residential property. Category 1 water loss affecting kitchen and adjacent dining area.
                        Initial moisture readings indicate saturation in flooring and lower wall sections. Drying equipment deployed same day.
                        Estimated restoration cost: $4,850.
                      </p>
                    </div>

                    <div style={{
                      padding: '16px 24px',
                      backgroundColor: '#f8fafc',
                      borderTop: '1px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <span style={{fontSize: 13, color: '#64748b'}}>Prepared by CleanExpo Restoration</span>
                      <div style={{display: 'flex', gap: 12}}>
                        <button style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#fff',
                          color: '#334155',
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}>Download PDF</button>
                        <button style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          border: 'none',
                          backgroundColor: '#059669',
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}>Approve Report</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScreenContainer>
      </div>

      {/* Mouse — Step 1: Click Share */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s1 && frame < s2 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={700} startY={300} endX={760} endY={130} startFrame={s1 + 20} endFrame={s1 + 50} clickFrame={s1 + 48} />
        <HighlightBox x={740} y={110} width={100} height={44} startFrame={s1 + 45} endFrame={s1 + 70} />
        <Annotation text="Click Share to generate a secure client portal link." x={520} y={90} startFrame={s1 + 40} endFrame={s1 + 110} />
      </div>

      {/* Mouse — Step 2: Copy link */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s2 && frame < s3 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={760} startY={130} endX={600} endY={350} startFrame={s2 + 15} endFrame={s2 + 45} clickFrame={s2 + 43} />
        <HighlightBox x={400} y={330} width={260} height={50} startFrame={s2 + 40} endFrame={s2 + 70} />
        <Annotation text="Copy the secure link or send directly via email." x={380} y={300} startFrame={s2 + 35} endFrame={s2 + 130} />
      </div>

      {/* Mouse — Step 3: Client views report */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s3 && frame < s4 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={600} startY={350} endX={400} endY={500} startFrame={s3 + 15} endFrame={s3 + 45} />
        <Annotation text="Your client sees a branded, professional report..." x={300} y={480} startFrame={s3 + 35} endFrame={s3 + 110} />
      </div>

      {/* Mouse — Step 4: Client approves */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s4 && frame < s5 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={400} startY={500} endX={720} endY={580} startFrame={s4 + 15} endFrame={s4 + 45} clickFrame={s4 + 43} />
        <HighlightBox x={700} y={560} width={140} height={44} startFrame={s4 + 40} endFrame={s4 + 70} />
        <Annotation text="...and can approve it with one click." x={520} y={540} startFrame={s4 + 35} endFrame={s4 + 130} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: outroOpacity, zIndex: outroOpacity > 0 ? 100 : 0}}>
        <OutroSlide title="Share reports with confidence." subtitle="RestoreAssist Client Portal" />
      </div>
    </AbsoluteFill>
  );
};
