import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const MoistureDeepDive = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 600, 630], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [610, 640, 1890, 1920], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1900, 1950, 2270, 2320], [0, 1, 1, 1]);

  const methods = [
    {title:'Pin-Type (Resistance)',desc:'Penetrates surface to measure moisture at depth. Best for timber and drywall staging. Gives actual moisture content percentage.'},
    {title:'Pinless (Electromagnetic)',desc:'Non-destructive scan across large areas. Ideal for initial surveys and mapping moisture fronts. Reads up to 25mm depth.'},
    {title:'Thermohygrometer',desc:'Measures relative humidity and temperature. Calculates dew point and vapor pressure. Critical for establishing drying goals.'},
    {title:'Thermal Imaging',desc:'FLIR camera detects temperature differentials. Moisture evaporation cools surfaces — visible as cold spots. Non-contact, fast coverage.'},
  ];

  const workflow = [
    {step:'Baseline',desc:'Record ambient RH/temp. Establish dry standard for material type (e.g., 12% timber EMC).'},
    {step:'Survey',desc:'Pinless scan entire affected area. Mark moisture map with boundaries and severity zones.'},
    {step:'Probe',desc:'Pin-type readings at 5 locations per zone. Log depth, MC%, and material type.'},
    {step:'Map',desc:'Plot readings on floor plan. Identify migration paths and hidden pockets.'},
    {step:'Goal',desc:'Set target MC% and timeline. Calculate dehumidification capacity required.'},
    {step:'Monitor',desc:'Daily readings until goal reached. Auto-alert if progress stalls.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Moisture Mapping — Deep Dive" subtitle="The science behind dry standard compliance." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:16}}>
            <div style={{fontSize:26,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Measurement Methods</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {methods.map(m => (
                <div key={m.title} style={{padding:18,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.25)'}}>
                  <div style={{fontSize:15,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{m.title}</div>
                  <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',lineHeight:1.4}}>{m.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:4}}>Workflow</div>
            <div style={{display:'flex',gap:10}}>
              {workflow.map(w => (
                <div key={w.step} style={{flex:1,padding:12,backgroundColor:'#1C2E47',borderRadius:8,borderTop:'3px solid #8A6B4E',textAlign:'center'}}>
                  <div style={{fontSize:12,fontWeight:700,color:'#8A6B4E',fontFamily:'Inter'}}>{w.step}</div>
                  <div style={{fontSize:10,color:'#D4A574',fontFamily:'Inter',marginTop:4}}>{w.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Dry standard compliance, documented." subtitle="IICRC S500 methodology built in." />
      </div>
    </AbsoluteFill>
  );
};
