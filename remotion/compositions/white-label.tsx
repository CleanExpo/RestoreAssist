import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const WhiteLabel = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 540, 570], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [550, 580, 1650, 1680], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1660, 1710, 1950, 1980], [0, 1, 1, 1]);

  const customisations = [
    {icon:'🎨',title:'Brand Colours',desc:'Set primary and secondary colours. Icon tints, button fills, and header bars update company-wide.'},
    {icon:'🖼️',title:'Logo Upload',desc:'SVG or high-res PNG. Logo appears in app header, PDF reports, client portal, and email templates.'},
    {icon:'✍️',title:'Custom Domain',desc:'Use yourcompany.restoreassist.app or CNAME your own domain. SSL certificate included.'},
    {icon:'📄',title:'Report Styling',desc:'Custom cover page, footer text, and disclaimer blocks. Match your existing stationery exactly.'},
  ];

  const tiers = [
    {name:'Essential',features:'Logo + colours',price:'Included'},
    {name:'Professional',features:'+ Custom domain + report styling',price:'Included'},
    {name:'Enterprise',features:'+ Sub-brand management + API white-label',price:'Contact us'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="White Label" subtitle="Your brand. Your clients. Our platform." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:20}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Brand Customisation</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              {customisations.map(c => (
                <div key={c.title} style={{padding:24,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:28,marginBottom:8}}>{c.icon}</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{c.title}</div>
                  <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',lineHeight:1.5}}>{c.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:6}}>Available In</div>
            <div style={{display:'flex',gap:16,justifyContent:'center'}}>
              {tiers.map(t => (
                <div key={t.name} style={{textAlign:'center',padding:'18px 28px',backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid #8A6B4E'}}>
                  <div style={{fontSize:16,fontWeight:700,color:'#FFF',fontFamily:'Inter'}}>{t.name}</div>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',marginTop:4}}>{t.features}</div>
                  <div style={{fontSize:14,fontWeight:700,color:'#8A6B4E',fontFamily:'Inter',marginTop:6}}>{t.price}</div>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Your brand, front and centre." subtitle="Clients never know we are here." />
      </div>
    </AbsoluteFill>
  );
};
