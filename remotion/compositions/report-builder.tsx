import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const ReportBuilder = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0, d1, d2, d3, d4, d5] = stepDurations;
  const s0 = 0, s1 = s0 + d0, s2 = s1 + d1, s3 = s2 + d2, s4 = s3 + d3, s5 = s4 + d4, s6 = s5 + d5;

  const introOpacity = interpolate(frame, [s0, s0 + 20, s1 - 20, s1], [1, 1, 1, 0]);
  const outroOpacity = interpolate(frame, [s6, s6 + 10, s6 + 25, s6 + 40], [0, 1, 1, 1]);
  const mainOpacity = interpolate(frame, [s1 - 10, s1], [0, 1]);

  const sections = ['Executive Summary', 'Scope of Works', 'Cost Estimation', 'Photo Evidence', 'Moisture Readings', 'Compliance Notes'];

  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', inset: 0, opacity: introOpacity, zIndex: introOpacity > 0 ? 100 : 0}}>
        <IntroSlide title={title} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: mainOpacity, zIndex: 10}}>
        <ScreenContainer>
          <div style={{display: 'flex', width: '100%', height: '100%'}}>
            <Sidebar activeItem="reports" frame={frame} startFrame={s1} endFrame={s2} />
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
              <TopBar />
              <div style={{padding: 32, flex: 1, overflow: 'auto'}}>

                {/* Report sections */}
                {frame >= s1 && frame < s6 && (
                  <div>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24}}>
                      <div>
                        <div style={{fontSize: 13, color: '#D4A574', fontFamily: 'Inter'}}>INS-2026-0089</div>
                        <h1 style={{fontSize: 26, fontWeight: 700, color: '#1C2E47', margin: 0, fontFamily: 'Inter'}}>Critical Report Builder</h1>
                      </div>
                      <div style={{display: 'flex', gap: 12}}>
                        <button style={{padding: '10px 20px', borderRadius: 8, border: '1px solid #2A3A55', backgroundColor: '#fff', color: '#1C2E47', fontSize: 14, fontWeight: 600, fontFamily: 'Inter'}}>Preview</button>
                        <button style={{padding: '10px 20px', borderRadius: 8, border: 'none', backgroundColor: '#8A6B4E', color: '#fff', fontSize: 14, fontWeight: 600, fontFamily: 'Inter'}}>Publish</button>
                      </div>
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24}}>
                      <div>
                        <h3 style={{fontSize: 13, fontWeight: 600, color: '#8A6B4E', margin: '0 0 12px', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Sections</h3>
                        <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                          {sections.map((sec, i) => (
                            <div key={sec} style={{
                              padding: '10px 14px',
                              borderRadius: 8,
                              backgroundColor: i === 0 ? '#fef2f2' : 'transparent',
                              color: i === 0 ? '#8A6B4E' : '#1C2E47',
                              fontSize: 14,
                              fontWeight: i === 0 ? 600 : 500,
                              fontFamily: 'Inter',
                              cursor: 'pointer',
                            }}>{sec}</div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <EditorCard title="Executive Summary" content="Water damage event at residential property. Category 1 water loss affecting kitchen and adjacent dining area. Initial moisture readings indicate saturation in flooring and lower wall sections. Drying equipment deployed same day." />
                        <EditorCard title="Scope of Works" content="Remove and dispose of saturated flooring sections. Extract standing water. Deploy air movers and dehumidifiers. Monitor daily moisture readings until goal achieved." />
                        <EditorCard title="Cost Estimation" content="Equipment hire: $1,200 | Labour (24hrs): $2,400 | Materials: $850 | Disposal: $400 | Total: $4,850" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>

      {/* Mouse animations */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s1 && frame < s2 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={100} startY={280} endX={100} endY={280} startFrame={s1 + 20} endFrame={s1 + 40} clickFrame={s1 + 38} />
        <HighlightBox x={20} y={260} width={220} height={44} startFrame={s1 + 35} endFrame={s1 + 55} />
        <Annotation text="Navigate to Reports to build your professional documentation." x={300} y={270} startFrame={s1 + 30} endFrame={s1 + 100} />
      </div>

      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s2 && frame < s3 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={500} startY={400} endX={350} endY={250} startFrame={s2 + 15} endFrame={s2 + 45} clickFrame={s2 + 43} />
        <HighlightBox x={300} y={200} width={240} height={160} startFrame={s2 + 40} endFrame={s2 + 70} />
        <Annotation text="Each section auto-populates from your inspection data." x={400} y={180} startFrame={s2 + 35} endFrame={s2 + 130} />
      </div>

      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s3 && frame < s4 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={350} startY={250} endX={700} endY={300} startFrame={s3 + 15} endFrame={s3 + 45} clickFrame={s3 + 43} />
        <HighlightBox x={620} y={80} width={120} height={44} startFrame={s3 + 40} endFrame={s3 + 70} />
        <Annotation text="Preview the report before publishing to the client." x={500} y={60} startFrame={s3 + 35} endFrame={s3 + 130} />
      </div>

      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s4 && frame < s5 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={700} startY={300} endX={800} endY={80} startFrame={s4 + 15} endFrame={s4 + 45} clickFrame={s4 + 43} />
        <HighlightBox x={760} y={64} width={100} height={44} startFrame={s4 + 40} endFrame={s4 + 70} />
        <Annotation text="Click Publish to generate the final PDF and share with your client." x={560} y={120} startFrame={s4 + 35} endFrame={s4 + 130} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: outroOpacity, zIndex: outroOpacity > 0 ? 100 : 0}}>
        <OutroSlide title="Professional reports, done in minutes." subtitle="RestoreAssist" />
      </div>
    </AbsoluteFill>
  );
};

const EditorCard = ({title, content}) => (
  <div style={{
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    border: '1px solid #2A3A55',
    marginBottom: 16,
  }}>
    <h4 style={{fontSize: 15, fontWeight: 600, color: '#1C2E47', margin: '0 0 8px', fontFamily: 'Inter'}}>{title}</h4>
    <p style={{fontSize: 14, color: '#1C2E47', lineHeight: 1.6, margin: 0, fontFamily: 'Inter'}}>{content}</p>
  </div>
);
