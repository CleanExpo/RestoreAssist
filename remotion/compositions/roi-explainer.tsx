import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const ROIExplainer = () => {
  const frame = useCurrentFrame();
  const i = interpolate(frame, [0, 30, 270, 300], [0, 1, 1, 0]);
  const m = interpolate(frame, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const o = interpolate(frame, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:i,zIndex:i>0?100:0}}>
        <IntroSlide title="Your Time Is Worth More Than Admin" subtitle="See what RestoreAssist gives back each week" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:m,zIndex:m>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:24}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>The Cost of Manual Admin</div>
            <div style={{fontSize:15,color:'#D4A574',fontFamily:'Inter',marginTop:-16}}>Based on feedback from 200+ restoration companies</div>
            <div style={{display:'flex',gap:16,flex:1}}>
              {[
                {hrs:'8 hrs',label:'Manual reporting',cost:'Per job'},
                {hrs:'4 hrs',label:'Photo organisation',cost:'Per job'},
                {hrs:'2 hrs',label:'Invoice delays',cost:'Per job'},
                {hrs:'14 hrs',label:'Total admin',cost:'Per job'},
              ].map(x => (
                <div key={x.label} style={{flex:1,padding:24,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)',textAlign:'center'}}>
                  <div style={{fontSize:32,fontWeight:800,color:'#ef4444',fontFamily:'Inter'}}>{x.hrs}</div>
                  <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginTop:8}}>{x.label}</div>
                  <div style={{fontSize:11,color:'#8A6B4E',marginTop:4}}>{x.cost}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:16,flex:1}}>
              {[
                {hrs:'2 hrs',label:'With RestoreAssist',cost:'Auto reports'},
                {hrs:'15 min',label:'Photo sync',cost:'Instant upload'},
                {hrs:'Instant',label:'Invoice',cost:'Auto from report'},
                {hrs:'2.5 hrs',label:'Total',cost:'87% reduction'},
              ].map(x => (
                <div key={x.label} style={{flex:1,padding:24,backgroundColor:'rgba(34,197,94,0.1)',borderRadius:12,border:'1px solid #22c55e',textAlign:'center'}}>
                  <div style={{fontSize:32,fontWeight:800,color:'#22c55e',fontFamily:'Inter'}}>{x.hrs}</div>
                  <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginTop:8}}>{x.label}</div>
                  <div style={{fontSize:11,color:'#22c55e',marginTop:4}}>{x.cost}</div>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:o,zIndex:o>0?100:0}}>
        <OutroSlide title="87% less admin. More billable hours." subtitle="Calculate your ROI at restoreassist.com.au" />
      </div>
    </AbsoluteFill>
  );
};
