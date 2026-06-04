import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const LinkedInShort1 = () => {
  const f = useCurrentFrame();
  const h1 = interpolate(f, [0, 15], [0, 1]);
  const h2 = interpolate(f, [15, 30], [0, 1]);
  const h3 = interpolate(f, [30, 45], [0, 1]);
  const cta = interpolate(f, [45, 60], [0, 1]);

  return (
    <AbsoluteFill style={{backgroundColor:'#1C2E47',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'Inter, sans-serif',padding:40}}>
      <div style={{position:'absolute',top:40,left:40,display:'flex',alignItems:'center',gap:10,opacity:h1}}>
        <div style={{width:40,height:40,borderRadius:10,backgroundColor:'#8A6B4E',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <img src='/logo.png' style={{width:28,height:'auto'}} />
        </div>
        <div style={{fontSize:18,fontWeight:700,color:'#FFF'}}>RestoreAssist</div>
      </div>
      <div style={{fontSize:56,fontWeight:800,color:'#ef4444',textAlign:'center',opacity:h1,transform:`scale(${h1})`,lineHeight:1.1}}>
        14 hours
      </div>
      <div style={{fontSize:24,color:'#D4A574',textAlign:'center',marginTop:12,opacity:h2}}>
        of admin per restoration job
      </div>
      <div style={{fontSize:20,color:'#8A6B4E',textAlign:'center',marginTop:8,opacity:h2}}>
        Reports. Photos. Invoices. Follow-ups.
      </div>
      <div style={{marginTop:40,padding:'16px 32px',backgroundColor:'#22c55e',borderRadius:12,opacity:h3}}>
        <div style={{fontSize:32,fontWeight:800,color:'#FFF'}}>↓ 2 hours</div>
        <div style={{fontSize:14,color:'rgba(255,255,255,0.8)',marginTop:4,textAlign:'center'}}>With RestoreAssist</div>
      </div>
      <div style={{position:'absolute',bottom:40,fontSize:16,color:'#8A6B4E',opacity:cta}}>
        restoreassist.com.au
      </div>
    </AbsoluteFill>
  );
};
