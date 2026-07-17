import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const TrainingFireSmoke = () => {
  const f = useCurrentFrame();
  const i = interpolate(f, [0, 30, 270, 300], [0, 1, 1, 0]);
  const m = interpolate(f, [280, 310, 1020, 1050], [0, 1, 1, 0]);
  const o = interpolate(f, [1030, 1080, 1280, 1320], [0, 1, 1, 1]);

  const types = [
    {name:'Protein Fire',source:'Kitchen (meat, poultry)',residue:'Virtually invisible. Extremely pungent odour.',surface:'Clings to varnished/painted surfaces. Requires sealant primer.',health:'Eye and respiratory irritation from sulphur compounds.'},
    {name:'Natural Substance',source:'Paper, wood, natural fabrics',residue:'Dry, powdery, grey-black soot. Easiest to clean.',surface:'Vacuum with HEPA. Wet clean with alkaline detergent.',health:'Lung irritant. Avoid stirring into air during cleanup.'},
    {name:'Synthetic / Chemical',source:'Plastics, rubber, oil-based paint',residue:'Thick, sticky, smeary. Black, dense smoke.',surface:'Requires solvent-based cleaner. May need soda blasting.',health:'Acidic and toxic fumes. Full PPE mandatory. Ventilate thoroughly.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:i,zIndex:i>0?100:0}}>
        <IntroSlide title="Fire & Smoke Damage Types" subtitle="Training: identify the residue, choose the remediation (IICRC S730)" />
      </div>
      <div style={{position:'absolute',inset:0,opacity:m,zIndex:m>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'40px 50px',display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontSize:26,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Fire &amp; Smoke Damage Types</div>
            <div style={{fontSize:13,color:'#D4A574',fontFamily:'Inter',marginTop:-8}}>IICRC S730 Standard for Professional Fire and Smoke Damage Restoration</div>
            <div style={{display:'flex',flexDirection:'column',gap:10,flex:1,justifyContent:'center'}}>
              {types.map(t => (
                <div key={t.name} style={{padding:16,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.3)'}}>
                  <div style={{display:'flex',gap:12,alignItems:'baseline',marginBottom:6}}>
                    <div style={{fontSize:15,fontWeight:800,color:'#FFF',fontFamily:'Inter'}}>{t.name}</div>
                    <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter'}}>{t.source}</div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                    <div>
                      <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',marginBottom:2}}>Residue</div>
                      <div style={{fontSize:11,color:'#8A6B4E',fontFamily:'Inter'}}>{t.residue}</div>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',marginBottom:2}}>Surface treatment</div>
                      <div style={{fontSize:11,color:'#8A6B4E',fontFamily:'Inter'}}>{t.surface}</div>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',marginBottom:2}}>Health note</div>
                      <div style={{fontSize:11,color:'#ef4444',fontFamily:'Inter'}}>{t.health}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{padding:10,backgroundColor:'rgba(34,197,94,0.1)',borderRadius:8,border:'1px solid #22c55e',fontSize:11,color:'#22c55e',fontFamily:'Inter',textAlign:'center'}}>
              Always test-clean a small area first. Document residue type in every RestoreAssist inspection for insurance reference.
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:o,zIndex:o>0?100:0}}>
        <OutroSlide title="Identify the residue. Treat it right." subtitle="RestoreAssist captures every detail for insurance and compliance." />
      </div>
    </AbsoluteFill>
  );
};
