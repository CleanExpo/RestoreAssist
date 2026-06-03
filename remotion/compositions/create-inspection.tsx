import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

export const CreateInspection = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0, d1, d2, d3, d4, d5, d6, d7] = stepDurations;

  const s0 = 0, s1 = s0 + d0, s2 = s1 + d1, s3 = s2 + d2, s4 = s3 + d3, s5 = s4 + d4, s6 = s5 + d5, s7 = s6 + d6, s8 = s7 + d7;

  const introOpacity = interpolate(frame, [s0, s0 + 20, s1 - 20, s1], [1, 1, 1, 0]);
  const outroOpacity = interpolate(frame, [s7, s7 + 10, s7 + 25, s7 + 40], [0, 1, 1, 1]);
  const mainOpacity = interpolate(frame, [s1 - 10, s1], [0, 1]);

  const clients = [
    {name: 'Mrs Jane Smith', address: '42 Example Street, Sydney NSW 2000'},
    {name: 'Mr John Davis', address: '15 Ocean Road, Bondi NSW 2026'},
    {name: 'Supreme Cleaning', address: '200 King Street, Melbourne VIC 3000'},
    {name: 'Restoration Pro Pty', address: '88 Bridge Street, Brisbane QLD 4000'},
  ];

  const hazardTypes = ['Water Damage', 'Fire & Smoke', 'Mould', 'Storm Damage', 'Sewage Backup', 'Biohazard'];
  const insuranceTypes = ['Building', 'Contents', 'Both', 'Motor'];

  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', inset: 0, opacity: introOpacity, zIndex: introOpacity > 0 ? 100 : 0}}>
        <IntroSlide title={title} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: mainOpacity, zIndex: 10}}>
        <ScreenContainer>
          <div style={{display: 'flex', width: '100%', height: '100%'}}>
            <Sidebar activeItem="inspections" frame={frame} startFrame={s1} endFrame={s2} />

            <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
              <TopBar />

              <div style={{padding: 32, flex: 1, overflow: 'auto'}}>
                {/* Step 2b — Client Selection */}
                {frame >= s2 && frame < s3 && (
                  <div style={{maxWidth: 640, margin: '0 auto'}}>
                    <h2 style={{fontSize: 24, fontWeight: 700, color: '#1C2E47', margin: '0 0 8px', fontFamily: 'Inter'}}>New Inspection</h2>
                    <p style={{fontSize: 14, color: '#8A6B4E', margin: '0 0 24px', fontFamily: 'Inter'}}>Select a client to begin...</p>

                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                      {clients.map((c, i) => (
                        <div key={c.name} style={{
                          padding: 16,
                          borderRadius: 12,
                          border: '1px solid #2A3A55',
                          backgroundColor: '#ffffff',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}>
                          <div style={{fontSize: 15, fontWeight: 600, color: '#1C2E47', fontFamily: 'Inter'}}>{c.name}</div>
                          <div style={{fontSize: 13, color: '#D4A574', fontFamily: 'Inter'}}>{c.address}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 3 — Form */}
                {frame >= s3 && frame < s6 && (
                  <div style={{maxWidth: 720, margin: '0 auto'}}>
                    <h2 style={{fontSize: 24, fontWeight: 700, color: '#1C2E47', margin: '0 0 24px', fontFamily: 'Inter'}}>
                      New Inspection: <span style={{color: '#8A6B4E'}}>Mrs Jane Smith</span>
                    </h2>

                    <FormField label="Property Address" value="42 Example Street, Sydney NSW 2000" frame={frame - s3} delay={0} />
                    <FormField label="Hazard Type" options={hazardTypes} selected="Water Damage" frame={frame - s3} delay={30} />
                    <FormField label="Insurance Type" options={insuranceTypes} selected="Building" frame={frame - s3} delay={60} />
                    <FormField label="Description" value="Kitchen supply line burst causing Category 1 water damage..." multiline frame={frame - s3} delay={90} />

                    <div style={{
                      marginTop: 32,
                      display: 'flex',
                      gap: 12,
                      justifyContent: 'flex-end',
                    }}>
                      <button style={{
                        padding: '12px 24px',
                        borderRadius: 8,
                        border: '1px solid #2A3A55',
                        backgroundColor: '#ffffff',
                        color: '#8A6B4E',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: 'Inter',
                        cursor: 'pointer',
                      }}>Cancel</button>
                      <button style={{
                        padding: '12px 24px',
                        borderRadius: 8,
                        border: 'none',
                        backgroundColor: '#8A6B4E',
                        color: '#ffffff',
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: 'Inter',
                        cursor: 'pointer',
                      }}>Create Inspection</button>
                    </div>
                  </div>
                )}

                {/* Step 6 — Inspection Page */}
                {frame >= s6 && frame < s8 && (
                  <div>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 24,
                    }}>
                      <div>
                        <div style={{fontSize: 13, color: '#D4A574', fontFamily: 'Inter', marginBottom: 4}}>INS-2026-0089</div>
                        <h1 style={{fontSize: 28, fontWeight: 700, color: '#1C2E47', margin: 0, fontFamily: 'Inter'}}>Water Damage — Kitchen</h1>
                      </div>
                      <span style={{
                        padding: '6px 16px',
                        borderRadius: 12,
                        backgroundColor: '#fef3c7',
                        color: '#d97706',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: 'Inter',
                      }}>In Progress</span>
                    </div>

                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24}}>
                      <InfoCard label="Client" value="Mrs Jane Smith" icon="👤" />
                      <InfoCard label="Property" value="42 Example Street, Sydney" icon="🏠" />
                      <InfoCard label="Hazard" value="Water Damage (Cat 1)" icon="💧" />
                      <InfoCard label="Insurance" value="Building" icon="📋" />
                    </div>

                    <div style={{display: 'flex', gap: 12}}>
                      {['Evidence', 'Photos', 'Moisture', 'Scope', 'Report'].map((tab, i) => (
                        <button key={tab} style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          border: 'none',
                          backgroundColor: i === 0 ? '#8A6B4E' : '#f1f5f9',
                          color: i === 0 ? '#ffffff' : '#8A6B4E',
                          fontSize: 14,
                          fontWeight: 600,
                          fontFamily: 'Inter',
                          cursor: 'pointer',
                        }}>{tab}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>

      {/* Mouse — Step 1: New Inspection button */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s1 && frame < s2 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={100} startY={200} endX={100} endY={200} startFrame={s1 + 20} endFrame={s1 + 40} clickFrame={s1 + 38} />
        <HighlightBox x={20} y={180} width={220} height={44} startFrame={s1 + 35} endFrame={s1 + 50} />
        <Annotation text="Click New Inspection to start documenting a job." x={300} y={190} startFrame={s1 + 30} endFrame={s1 + 100} />
      </div>

      {/* Mouse — Step 2: Select client */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s2 && frame < s3 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={500} startY={300} endX={500} endY={280} startFrame={s2 + 15} endFrame={s2 + 45} clickFrame={s2 + 43} />
        <HighlightBox x={330} y={140} width={660} height={80} startFrame={s2 + 40} endFrame={s2 + 60} />
        <Annotation text="Select an existing client or add a new one." x={420} y={120} startFrame={s2 + 35} endFrame={s2 + 130} />
      </div>

      {/* Mouse — Step 3: Fill hazard type */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s3 && frame < s4 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={500} startY={500} endX={500} endY={360} startFrame={s3 + 15} endFrame={s3 + 45} clickFrame={s3 + 43} />
        <HighlightBox x={330} y={200} width={660} height={56} startFrame={s3 + 40} endFrame={s3 + 60} />
        <Annotation text="Select the hazard type — this drives the inspection checklist." x={420} y={180} startFrame={s3 + 35} endFrame={s3 + 130} />
      </div>

      {/* Mouse — Step 4: Insurance */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s4 && frame < s5 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={500} startY={360} endX={500} endY={430} startFrame={s4 + 15} endFrame={s4 + 45} clickFrame={s4 + 43} />
        <HighlightBox x={330} y={270} width={660} height={56} startFrame={s4 + 40} endFrame={s4 + 60} />
        <Annotation text="Set the insurance type — Building, Contents, or both." x={420} y={250} startFrame={s4 + 35} endFrame={s4 + 130} />
      </div>

      {/* Mouse — Step 5: Description + Save */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s5 && frame < s6 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={500} startY={430} endX={750} endY={620} startFrame={s5 + 15} endFrame={s5 + 45} clickFrame={s5 + 43} />
        <HighlightBox x={700} y={600} width={140} height={44} startFrame={s5 + 40} endFrame={s5 + 70} />
        <Annotation text="Add a description, then save. Your inspection is created." x={500} y={580} startFrame={s5 + 35} endFrame={s5 + 130} />
      </div>

      {/* Mouse — Step 6: Inspection tabs */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s6 && frame < s7 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={400} startY={600} endX={600} endY={480} startFrame={s6 + 15} endFrame={s6 + 45} clickFrame={s6 + 43} />
        <HighlightBox x={560} y={460} width={100} height={40} startFrame={s6 + 40} endFrame={s6 + 65} />
        <Annotation text="Switch between tabs to add evidence, photos, and readings." x={400} y={440} startFrame={s6 + 35} endFrame={s6 + 150} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: outroOpacity, zIndex: outroOpacity > 0 ? 100 : 0}}>
        <OutroSlide title="Inspections simplified. Reports accelerated." subtitle="RestoreAssist" />
      </div>
    </AbsoluteFill>
  );
};

const FormField = ({label, value, options, selected, multiline, frame, delay}) => {
  const fadeIn = interpolate(frame - delay, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <div style={{marginBottom: 20, opacity: fadeIn}}>
      <label style={{display: 'block', fontSize: 14, fontWeight: 600, color: '#1C2E47', marginBottom: 8, fontFamily: 'Inter'}}>{label}</label>
      {options ? (
        <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
          {options.map((opt) => (
            <span key={opt} style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid ' + (opt === selected ? '#8A6B4E' : '#2A3A55'),
              backgroundColor: opt === selected ? '#fef2f2' : '#ffffff',
              color: opt === selected ? '#8A6B4E' : '#1C2E47',
              fontSize: 14,
              fontWeight: 500,
              fontFamily: 'Inter',
            }}>{opt}</span>
          ))}
        </div>
      ) : (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          border: '1px solid #2A3A55',
          backgroundColor: '#ffffff',
          fontSize: 14,
          color: '#1C2E47',
          fontFamily: 'Inter',
          minHeight: multiline ? 80 : 'auto',
        }}>{value}</div>
      )}
    </div>
  );
};

const InfoCard = ({label, value, icon}) => (
  <div style={{
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#0A0A0A',
    border: '1px solid #2A3A55',
  }}>
    <div style={{fontSize: 12, color: '#D4A574', marginBottom: 4, fontFamily: 'Inter', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em'}}>{label}</div>
    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
      <span style={{fontSize: 18}}>{icon}</span>
      <span style={{fontSize: 15, fontWeight: 600, color: '#1C2E47', fontFamily: 'Inter'}}>{value}</span>
    </div>
  </div>
);
