import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const LinkedInShort2 = () => {
  const f = useCurrentFrame();
  const o1 = interpolate(f, [0, 15], [0, 1]);
  const o2 = interpolate(f, [15, 30], [0, 1]);
  const o3 = interpolate(f, [30, 45], [0, 1]);
  const pulse = interpolate(f, [45, 60], [0, 1]);

  return (
    <AbsoluteFill style={{backgroundColor:'#1C2E47',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'Inter, sans-serif',padding:40}}>
      <div style={{position:'absolute',top:40,left:40,display:'flex',alignItems:'center',gap:10,opacity:o1}}>
        <div style={{width:40,height:40,borderRadius:10,backgroundColor:'#8A6B4E',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <img src='/logo.png' style={{width:28,height:'auto'}} />
        </div>
        <div style={{fontSize:18,fontWeight:700,color:'#FFF'}}>RestoreAssist</div>
      </div>
      <div style={{fontSize:22,color:'#D4A574',textAlign:'center',maxWidth:500,opacity:o1,lineHeight:1.4}}>
        The big restoration claim at 42 Smith St relied on one thing:
      </div>
      <div style={{marginTop:24,padding:'20px 40px',backgroundColor:'rgba(138,107,78,0.2)',borderRadius:16,border:'2px solid #8A6B4E',opacity:o2}}>
        <div style={{fontSize:28,fontWeight:800,color:'#FFF',textAlign:'center'}}>Chain of Custody</div>
        <div style={{fontSize:16,color:'#D4A574',textAlign:'center',marginTop:6}}>Every photo geo-tagged. Every reading timestamped.</div>
      </div>
      <div style={{fontSize:20,color:'#22c55e',textAlign:'center',marginTop:30,opacity:o3}}>
        The insurer accepted the claim in 48 hours.
      </div>
      <div style={{fontSize:14,color:'#8A6B4E',textAlign:'center',marginTop:8,opacity:o3}}>
        Without it? Disputed. Delayed. Denied.
      </div>
      <div style={{position:'absolute',bottom:40,fontSize:16,color:'#8A6B4E',opacity:pulse}}>
        restoreassist.com.au
      </div>
    </AbsoluteFill>
  );
};
