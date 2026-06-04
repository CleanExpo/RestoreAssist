import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const APIWebhooks = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 600, 630], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [610, 640, 1830, 1860], [0, 1, 1, 0]);
  const codeOp = interpolate(frame, [900, 960, 1560, 1620], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1840, 1890, 2130, 2160], [0, 1, 1, 1]);

  const endpoints = [
    {method:'GET',path:'/api/v1/inspections',desc:'List all inspections with pagination, filtering, and sorting.'},
    {method:'GET',path:'/api/v1/inspections/:id',desc:'Retrieve full inspection details including photos and readings.'},
    {method:'POST',path:'/api/v1/inspections',desc:'Create new inspection with initial data and auto-assign.'},
    {method:'PUT',path:'/api/v1/inspections/:id',desc:'Update inspection status, notes, or assigned technician.'},
    {method:'GET',path:'/api/v1/reports/:id/pdf',desc:'Generate and download PDF report for given inspection.'},
    {method:'POST',path:'/api/v1/webhooks',desc:'Register webhook endpoint for real-time event notifications.'},
  ];

  const codeExample = `// Subscribe to inspection completion
const res = await fetch(
  'https://api.restoreassist.app/v1/webhooks',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: 'https://your-crm.com/webhook',
      events: ['inspection.completed'],
    }),
  }
);`;

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="API & Webhooks" subtitle="Connect RestoreAssist to your entire tech stack." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>REST API Endpoints</div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {endpoints.map(e => (
                <div key={e.path} style={{display:'flex',alignItems:'center',gap:16,padding:'10px 16px',backgroundColor:'#1C2E47',borderRadius:8}}>
                  <span style={{padding:'4px 10px',borderRadius:4,backgroundColor:e.method==='GET'?'#22c55e':'#3b82f6',color:'#fff',fontSize:11,fontWeight:700,fontFamily:'monospace'}}>{e.method}</span>
                  <span style={{fontSize:13,fontFamily:'monospace',color:'#8A6B4E'}}>{e.path}</span>
                  <span style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',marginLeft:'auto'}}>{e.desc}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:4}}>Webhook Example</div>
            <div style={{opacity:codeOp,padding:20,backgroundColor:'#0a0a0a',borderRadius:10,border:'1px solid #333',fontFamily:'monospace',fontSize:12,color:'#D4A574',lineHeight:1.6,whiteSpace:'pre'}}>
              {codeExample}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Build on top of RestoreAssist." subtitle="Full REST API + webhooks. Developer docs." />
      </div>
    </AbsoluteFill>
  );
};
