import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const TrainingWaterDamageCat = () => {
  const f = useCurrentFrame();
  const i = interpolate(f, [0, 30, 270, 300], [0, 1, 1, 0]);
  const m = interpolate(f, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const o = interpolate(f, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  const classes = [
    {cls:'Class 1',area:'Least',desc:'Wet area <5% of total sqm. Low evaporation materials only.',examples:'Concrete subfloor, tile'},
    {cls:'Class 2',area:'Significant',desc:'Wet area 5-40% of total sqm. Fast evaporation materials affected.',examples:'Carpet, cushion, gyprock, wood'},
    {cls:'Class 3',area:'Greatest',desc:'Wet area >40% of total sqm. Saturated in walls/ceilings.',examples:'Insulation, plasterboard, timber framing'},
    {cls:'Class 4',area:'Specialty',desc:'Deeply held or trapped water. Low-permeability materials.',examples:'Hardwood, brick, stone, concrete below grade'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:i,zIndex:i>0?100:0}}>
        <IntroSlide title="IICRC S500 Water Damage Classes" subtitle="Training: extent of wetness classification (S500 Ed. 4, 2024)" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:m,zIndex:m>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'40px 60px',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:26,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Water Damage Classes</div>
            <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',marginTop:-10}}>IICRC S500 Professional Standard, 4th Ed. (2024) | Section 12</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,flex:1}}>
              {classes.map(c => (
                <div key={c.cls} style={{padding:20,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{fontSize:14,fontWeight:800,color:'#FFF',fontFamily:'Inter'}}>{c.cls}</div>
                    <div style={{fontSize:11,padding:'4px 10px',backgroundColor:'rgba(138,107,78,0.2)',borderRadius:6,color:'#D4A574'}}>{c.area} affected</div>
                  </div>
                  <div style={{fontSize:12,color:'#FFF',fontFamily:'Inter',marginBottom:6,lineHeight:1.4}}>{c.desc}</div>
                  <div style={{fontSize:11,color:'#8A6B4E',fontFamily:'Inter'}}>Materials: <span style={{color:'#D4A574'}}>{c.examples}</span></div>
                </div>
              ))}
            </div>
            <div style={{padding:12,backgroundColor:'rgba(34,197,94,0.1)',borderRadius:8,border:'1px solid #22c55e',fontSize:12,color:'#22c55e',fontFamily:'Inter',textAlign:'center'}}>
              Tip: Class determines equipment deployment. Class 4 requires specialised drying systems and longer duration.
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:o,zIndex:o>0?100:0}}>
        <OutroSlide title="Class correctly. Dry efficiently." subtitle="RestoreAssist moisture mapping guides every step." />
      </div>
    </AbsoluteFill>
  );
};
