import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const NotificationsDeepDive = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 540, 570], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [550, 580, 1650, 1680], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1660, 1710, 1950, 1980], [0, 1, 1, 1]);

  const channels = [
    {icon:'📧',title:'Email',desc:'Instant, daily digest, or weekly summary. HTML templates. Custom subject lines.'},
    {icon:'💬',title:'SMS',desc:'Critical alerts only. Character-optimised. Delivered in under 5 seconds.'},
    {icon:'🔔',title:'In-App',desc:'Real-time bell notifications. Badge counts. Mark as read/unread. Group by type.'},
    {icon:'🔗',title:'Webhook',desc:'Push to Slack, Teams, or custom endpoint. JSON payload with full context.'},
  ];

  const triggers = [
    'Inspection assigned to you',
    'Report reviewed and signed off',
    'Client viewed portal document',
    'Compliance checklist overdue',
    'Equipment calibration expiry',
    'Team member licence renewal due',
    'Invoice payment received',
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Notification System" subtitle="Stay informed. Never miss what matters." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:20}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Delivery Channels</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              {channels.map(c => (
                <div key={c.title} style={{padding:24,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:28,marginBottom:8}}>{c.icon}</div>
                  <div style={{fontSize:17,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{c.title}</div>
                  <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',lineHeight:1.5}}>{c.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Smart Triggers</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              {triggers.map(t => (
                <div key={t} style={{padding:'10px 16px',backgroundColor:'#1C2E47',borderRadius:8,borderLeft:'3px solid #8A6B4E',fontSize:13,color:'#D4A574',fontFamily:'Inter'}}>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="The right info, right now." subtitle="Notifications that help, not harass." />
      </div>
    </AbsoluteFill>
  );
};
