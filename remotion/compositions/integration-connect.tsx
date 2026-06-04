import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from '../ui-elements/intro-slide';
import {OutroSlide} from '../ui-elements/outro-slide';
import {ScreenContainer} from '../../components/shared';

export const IntegrationConnect = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 270, 300], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [280, 310, 1920, 1950], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1930, 1960, 2220, 2250], [0, 1, 1, 1]);

  const connected = [
    {name:'Xero',icon:'📗',status:'Connected',date:'Connected Jun 1, 2026'},
    {name:'ServiceM8',icon:'🔧',status:'Disconnected'},
    {name:'QuickBooks Online',icon:'📘',status:'Disconnected'},
    {name:'Ascora',icon:'🛠️',status:'Disconnected'},
    {name:'MYOB Business',icon:'📙',status:'Disconnected'},
    {name:'Google Calendar',icon:'📅',status:'Connected',date:'Connected May 28, 2026'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Connecting Your Tools" subtitle="Integrate RestoreAssist with the software your team already uses" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:24}}>
            <div style={{fontSize:32,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Integrations</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2, 1fr)',gap:16}}>
              {connected.map(app => (
                <div key={app.name} style={{
                  padding:20,backgroundColor:'#1C2E47',borderRadius:12,
                  border:app.status==='Connected'?'1px solid #22c55e':'1px solid rgba(138,107,78,0.3)',
                  display:'flex',alignItems:'center',gap:16,
                }}>
                  <div style={{fontSize:36}}>{app.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:16,fontWeight:700,color:'#FFF',fontFamily:'Inter'}}>{app.name}</div>
                    <div style={{fontSize:12,color:app.status==='Connected'?'#22c55e':'#D4A574',fontFamily:'Inter'}}>
                      {app.status}{app.date?` — ${app.date}`:''}
                    </div>
                  </div>
                  <button style={{
                    padding:'8px 20px',borderRadius:8,border:'none',
                    backgroundColor:app.status==='Connected'?'rgba(34,197,94,0.2)':'#8A6B4E',
                    color:app.status==='Connected'?'#22c55e':'#FFF',
                    fontSize:13,fontWeight:600,fontFamily:'Inter',cursor:'pointer',
                  }}>{app.status==='Connected'?'Manage':'Connect'}</button>
                </div>
              ))}
            </div>
            <div style={{padding:20,backgroundColor:'rgba(138,107,78,0.1)',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
              <div style={{fontSize:16,fontWeight:600,color:'#D4A574',fontFamily:'Inter',marginBottom:8}}>What syncs automatically?</div>
              <div style={{display:'flex',gap:24}}>
                {['Clients & contacts','Job assignments','Invoices & billing','Calendar events','Compliance reminders'].map(item => (
                  <div key={item} style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'#FFF',fontFamily:'Inter'}}>
                    <span style={{color:'#22c55e'}}>✓</span>{item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Integrations configured." subtitle="Your workflow, unified." />
      </div>
    </AbsoluteFill>
  );
};
