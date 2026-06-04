import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const SettingsConfig = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 270, 300], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [280, 310, 1470, 1500], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1480, 1510, 1770, 1800], [0, 1, 1, 1]);

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Settings & Preferences" subtitle="Configure your account, company profile, and workflow defaults" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'40px 60px',display:'flex',gap:30}}>
            <div style={{width:240,padding:20,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
              <div style={{fontSize:14,fontWeight:700,color:'#D4A574',marginBottom:16,fontFamily:'Inter'}}>Settings</div>
              {['Profile','Company','Notifications','Integrations','Billing','Security','Team'].map(s => (
                <div key={s} style={{padding:'10px 12px',borderRadius:6,fontSize:13,color:'#FFF',fontFamily:'Inter',backgroundColor:s==='Profile'?'rgba(138,107,78,0.2)':'transparent'}}>{s}</div>
              ))}
            </div>
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:16}}>
              <div style={{fontSize:22,fontWeight:700,color:'#FFF',fontFamily:'Inter'}}>Profile Settings</div>
              <div style={{display:'flex',gap:20}}>
                <div style={{flex:1,padding:16,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:12,color:'#D4A574',marginBottom:8}}>Display Name</div>
                  <div style={{fontSize:16,color:'#FFF',fontFamily:'Inter'}}>Phill McGurk</div>
                </div>
                <div style={{flex:1,padding:16,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:12,color:'#D4A574',marginBottom:8}}>Email</div>
                  <div style={{fontSize:16,color:'#FFF',fontFamily:'Inter'}}>phill@restoreassist.com.au</div>
                </div>
              </div>
              <div style={{flex:1,padding:20,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                <div style={{fontSize:14,fontWeight:600,color:'#D4A574',marginBottom:12}}>Notification Preferences</div>
                {['Email on new inspection','SMS on urgent report','Weekly summary','Compliance alerts'].map(n => (
                  <div key={n} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(138,107,78,0.1)'}}>
                    <span style={{fontSize:14,color:'#FFF',fontFamily:'Inter'}}>{n}</span>
                    <div style={{width:40,height:22,borderRadius:11,backgroundColor:'#8A6B4E',display:'flex',alignItems:'center',padding:2}}><div style={{width:18,height:18,borderRadius:'50%',backgroundColor:'#FFF',marginLeft:'auto'}} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Settings saved." subtitle="Your workflow, your way." />
      </div>
    </AbsoluteFill>
  );
};
