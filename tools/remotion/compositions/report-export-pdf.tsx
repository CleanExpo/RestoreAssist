import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const ReportExportPDF = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 270, 300], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [280, 310, 1470, 1500], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1480, 1530, 1770, 1800], [0, 1, 1, 1]);

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Exporting Professional PDF Reports" subtitle="Generate branded, IICRC-aligned reports in seconds" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'40px 80px',display:'flex',flexDirection:'column',gap:20}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Report: RA-2026-08472</div>
                <div style={{fontSize:14,color:'#D4A574',fontFamily:'Inter',marginTop:4}}>Sarah Johnson — 42 Smith St, Sydney NSW</div>
              </div>
              <div style={{display:'flex',gap:10}}>
                <button style={{padding:'10px 20px',borderRadius:8,border:'1px solid #8A6B4E',backgroundColor:'transparent',color:'#D4A574',fontSize:13,fontWeight:600,fontFamily:'Inter'}}>Preview</button>
                <button style={{padding:'10px 24px',borderRadius:8,border:'none',backgroundColor:'#ef4444',color:'#FFF',fontSize:13,fontWeight:700,fontFamily:'Inter'}}>Export PDF</button>
              </div>
            </div>
            <div style={{flex:1,display:'flex',gap:20}}>
              <div style={{flex:2,backgroundColor:'#FFF',borderRadius:16,padding:30,display:'flex',flexDirection:'column',gap:16}}>
                <div style={{display:'flex',justifyContent:'space-between',borderBottom:'2px solid #8A6B4E',paddingBottom:16}}>
                  <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter',fontWeight:700}}>RESTOREASSIST</div>
                  <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter'}}>Certificate of Moisture Impact</div>
                </div>
                <div style={{fontSize:20,fontWeight:700,color:'#1C2E47',fontFamily:'Inter'}}>Moisture Impact Report — S500 Reference</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13,color:'#1C2E47',fontFamily:'Inter',lineHeight:1.6}}>
                  <div><strong>Property:</strong> 42 Smith St, Sydney NSW 2000</div>
                  <div><strong>Client:</strong> Sarah Johnson</div>
                  <div><strong>Technician:</strong> Phill McGurk (Cert. #RE-2847)</div>
                  <div><strong>Claim #:</strong> IAG-2026-08472</div>
                  <div><strong>Standard:</strong> IICRC S500-2021 12.3.1</div>
                  <div><strong>Category:</strong> Cat 3 — Grossly Contaminated</div>
                </div>
                <div style={{marginTop:8,padding:16,backgroundColor:'#f8fafc',borderRadius:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:'#1C2E47',marginBottom:8,fontFamily:'Inter'}}>Moisture Readings</div>
                  <div style={{display:'flex',gap:12}}>
                    <div style={{flex:1,textAlign:'center',padding:12,backgroundColor:'#FFF',borderRadius:8,border:'1px solid #e2e8f0'}}>
                      <div style={{fontSize:11,color:'#8A6B4E'}}>Initial</div>
                      <div style={{fontSize:24,fontWeight:700,color:'#ef4444'}}>85.4%</div>
                    </div>
                    <div style={{flex:1,textAlign:'center',padding:12,backgroundColor:'#FFF',borderRadius:8,border:'1px solid #e2e8f0'}}>
                      <div style={{fontSize:11,color:'#8A6B4E'}}>Dry Goal</div>
                      <div style={{fontSize:24,fontWeight:700,color:'#22c55e'}}>&le;16%</div>
                    </div>
                    <div style={{flex:1,textAlign:'center',padding:12,backgroundColor:'#FFF',borderRadius:8,border:'1px solid #e2e8f0'}}>
                      <div style={{fontSize:11,color:'#8A6B4E'}}>Current</div>
                      <div style={{fontSize:24,fontWeight:700,color:'#f59e0b'}}>34.2%</div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{width:240,display:'flex',flexDirection:'column',gap:12}}>
                <div style={{padding:16,backgroundColor:'#1C2E47',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#D4A574',marginBottom:10}}>Export Options</div>
                  {['PDF with logo','Plain PDF','Word document','CSV data','JSON export'].map((opt,i) => (
                    <div key={opt} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid rgba(138,107,78,0.1)',fontSize:12,color:'#FFF',fontFamily:'Inter'}}>
                      <div style={{width:14,height:14,borderRadius:'50%',border:'2px solid #8A6B4E',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {i===0 && <div style={{width:8,height:8,borderRadius:'50%',backgroundColor:'#8A6B4E'}} />}
                      </div>
                      {opt}
                    </div>
                  ))}
                </div>
                <div style={{padding:14,backgroundColor:'rgba(138,107,78,0.1)',borderRadius:12,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter',marginBottom:6}}>Branding</div>
                  <div style={{fontSize:12,color:'#FFF',fontFamily:'Inter'}}>CleanExpo Restoration Pty Ltd</div>
                  <div style={{fontSize:11,color:'#8A6B4E',fontFamily:'Inter',marginTop:4}}>ABN: 12 345 678 901</div>
                </div>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Report exported." subtitle="Professional documentation in seconds." />
      </div>
    </AbsoluteFill>
  );
};
