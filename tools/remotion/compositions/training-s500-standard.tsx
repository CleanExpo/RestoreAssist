import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const TrainingS500Standard = () => {
  const f = useCurrentFrame();
  const i = interpolate(f, [0, 30, 270, 300], [0, 1, 1, 0]);
  const m = interpolate(f, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const o = interpolate(f, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  const tables = [
    {grade:'Cat 1',name:'Clean Water',source:'Broken pipe, supply line',action:'Extract and dry within 24-48 hrs',risk:'Low — minimal contamination'},
    {grade:'Cat 2',name:'Grey Water',source:'Dishwasher, washing machine, sump',action:'Disinfect and dry within 24-48 hrs',risk:'Moderate — potential for microbial growth'},
    {grade:'Cat 3',name:'Black Water',source:'Sewage, flooding, seawater',action:'Remove porous materials. Full PPE. Disinfect.',risk:'High — pathogenic organisms — Category 3'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:i,zIndex:i>0?100:0}}>
        <IntroSlide title="IICRC S500 Water Categories" subtitle="Training: water damage classification (S500 Ed. 4, 2024)" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:m,zIndex:m>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'40px 60px',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:26,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Water Damage Categories</div>
            <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',marginTop:-10}}>IICRC S500 Professional Standard, 4th Ed. (2024) | Sections 10.2-10.4</div>
            <div style={{display:'flex',flexDirection:'column',gap:12,flex:1,justifyContent:'center'}}>
              {tables.map(t => (
                <div key={t.grade} style={{display:'flex',gap:16,padding:16,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.3)',alignItems:'center'}}>
                  <div style={{minWidth:80,textAlign:'center',padding:'10px 0',backgroundColor:t.grade==='Cat 3'?'#ef4444':'rgba(138,107,78,0.2)',borderRadius:8}}>
                    <div style={{fontSize:14,fontWeight:800,color:t.grade==='Cat 3'?'#FFF':'#D4A574',fontFamily:'Inter'}}>{t.grade}</div>
                    <div style={{fontSize:11,color:t.grade==='Cat 3'?'#FFF':'#8A6B4E',marginTop:2}}>{t.name}</div>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',marginBottom:4}}><strong style={{color:'#FFF'}}>Source:</strong> {t.source}</div>
                    <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',marginBottom:4}}><strong style={{color:'#FFF'}}>Action:</strong> {t.action}</div>
                    <div style={{fontSize:11,color:'#8A6B4E',fontFamily:'Inter'}}><strong style={{color:t.grade==='Cat 3'?'#ef4444':'#D4A574'}}>Risk:</strong> {t.risk}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{padding:12,backgroundColor:'rgba(34,197,94,0.1)',borderRadius:8,border:'1px solid #22c55e',fontSize:12,color:'#22c55e',fontFamily:'Inter',textAlign:'center'}}>
              Remember: Categories can escalate if left unattended. Cat 1 becomes Cat 2 after 48 hours.
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:o,zIndex:o>0?100:0}}>
        <OutroSlide title="Train your team on the standard." subtitle="Built into every RestoreAssist checklist." />
      </div>
    </AbsoluteFill>
  );
};
