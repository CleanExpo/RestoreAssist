import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const TrainingMouldRemediation = () => {
  const f = useCurrentFrame();
  const i = interpolate(f, [0, 30, 270, 300], [0, 1, 1, 0]);
  const m = interpolate(f, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const o = interpolate(f, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  const steps = [
    {step:'1. Assessment',desc:'Identify moisture source and visible mould. Use moisture meter. Photo document all affected areas.',icon:'🔍'},
    {step:'2. Containment',desc:'Isolate work area with negative air pressure. HEPA filtration required. Seal HVAC vents.',icon:'🧱'},
    {step:'3. PPE',desc:'Minimum: N95 mask, gloves, goggles. Remediation >10 sqm: full-face respirator + coveralls.',icon:'🦺'},
    {step:'4. Remediation',desc:'Physical removal of mould from non-porous surfaces. Discard porous materials (plasterboard, insulation).',icon:'🧹'},
    {step:'5. Verification',desc:'Post-remediation moisture reading ≤dry standard. Visual inspection clear. Optional air sampling.',icon:'✅'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:i,zIndex:i>0?100:0}}>
        <IntroSlide title="Mould Remediation Protocol" subtitle="Training: safe removal and verification (IICRC S520)" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:m,zIndex:m>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'40px 60px',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:26,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Mould Remediation Protocol</div>
            <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',marginTop:-10}}>Based on IICRC S520 Standard for Professional Mould Remediation</div>
            <div style={{display:'flex',flexDirection:'column',gap:10,flex:1,justifyContent:'center'}}>
              {steps.map(s => (
                <div key={s.step} style={{display:'flex',alignItems:'center',gap:16,padding:14,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:24}}>{s.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:'Inter'}}>{s.step}</div>
                    <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter',marginTop:2}}>{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{padding:12,backgroundColor:'rgba(239,68,68,0.1)',borderRadius:8,border:'1px solid #ef4444',fontSize:12,color:'#ef4444',fontFamily:'Inter',textAlign:'center'}}>
              ⚠️ Caution: Area &gt;10 m² and HVAC contamination require licensed remediation contractor (AU NATA/S600).
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:o,zIndex:o>0?100:0}}>
        <OutroSlide title="Remove mould safely. Document everything." subtitle="RestoreAssist guides each step of the protocol." />
      </div>
    </AbsoluteFill>
  );
};
