import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const HeroProductOverview = () => {
  const frame = useCurrentFrame();

  // Timing: 1800f total = 60s @ 30fps
  const introS = 0, introE = 180;
  const feature1S = 200, feature1E = 480;   // Dashboard (9.3s)
  const feature2S = 500, feature2E = 780;   // Inspections (9.3s)
  const feature3S = 800, feature3E = 1080;  // Reports (9.3s)
  const feature4S = 1100, feature4E = 1380; // Compliance (9.3s)
  const ctaS = 1400, ctaE = 1650;           // CTA (8.3s)
  const outroS = 1670;

  const introOp = interpolate(frame, [introS, introS + 30, introE - 30, introE + 20], [0, 1, 1, 0]);
  const f1Op = interpolate(frame, [feature1S - 20, feature1S, feature1E - 30, feature1E + 10], [0, 1, 1, 0]);
  const f2Op = interpolate(frame, [feature2S - 20, feature2S, feature2E - 30, feature2E + 10], [0, 1, 1, 0]);
  const f3Op = interpolate(frame, [feature3S - 20, feature3S, feature3E - 30, feature3E + 10], [0, 1, 1, 0]);
  const f4Op = interpolate(frame, [feature4S - 20, feature4S, feature4E - 30, feature4E + 10], [0, 1, 1, 0]);
  const ctaOp = interpolate(frame, [ctaS - 20, ctaS, ctaE, ctaE + 50], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [outroS, outroS + 30, outroS + 100, outroS + 130], [0, 1, 1, 1]);

  return (
    <AbsoluteFill>
      {/* Intro */}
      <div style={{position: 'absolute', inset: 0, opacity: introOp, zIndex: introOp > 0 ? 100 : 0}}>
        <IntroSlide title="RestoreAssist" subtitle="The complete restoration management platform" />
      </div>

      {/* Feature 1: Dashboard Overview */}
      <div style={{position: 'absolute', inset: 0, opacity: f1Op, zIndex: f1Op > 0 ? 10 : 0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:40}}>
            <h2 style={{fontSize:48,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',margin:0,textAlign:'center'}}>
              Everything in one place
            </h2>
            <FeatureCard
              icon="📊" title="Unified Dashboard"
              desc="Track inspections, reports, and team activity from a single view."
              highlight="Zero missed deadlines"
            />
          </div>
        </ScreenContainer>
      </div>

      {/* Feature 2: Inspections */}
      <div style={{position: 'absolute', inset: 0, opacity: f2Op, zIndex: f2Op > 0 ? 10 : 0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:40}}>
            <h2 style={{fontSize:48,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',margin:0,textAlign:'center'}}>
              Capture evidence that holds up
            </h2>
            <FeatureCard
              icon="📸" title="Chain of Custody"
              desc="Timestamped photo evidence, GPS location, and digital signatures."
              highlight="Court-admissible documentation"
            />
          </div>
        </ScreenContainer>
      </div>

      {/* Feature 3: Reports */}
      <div style={{position: 'absolute', inset: 0, opacity: f3Op, zIndex: f3Op > 0 ? 10 : 0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:40}}>
            <h2 style={{fontSize:48,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',margin:0,textAlign:'center'}}>
              Professional reports in minutes
            </h2>
            <FeatureCard
              icon="📝" title="IICRC-Aligned Reports"
              desc="Auto-populated S500 reports with standard references and signature blocks."
              highlight="Not hours — minutes"
            />
          </div>
        </ScreenContainer>
      </div>

      {/* Feature 4: Compliance */}
      <div style={{position: 'absolute', inset: 0, opacity: f4Op, zIndex: f4Op > 0 ? 10 : 0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:40}}>
            <h2 style={{fontSize:48,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',margin:0,textAlign:'center'}}>
              Stay compliant, stay confident
            </h2>
            <FeatureCard
              icon="✅" title="Compliance Tracking"
              desc="IICRC standard tracking, certification reminders, and audit-ready checklists."
              highlight="Pass every audit"
            />
          </div>
        </ScreenContainer>
      </div>

      {/* CTA Slide */}
      <div style={{position: 'absolute', inset: 0, opacity: ctaOp, zIndex: ctaOp > 0 ? 10 : 0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:30}}>
            <h2 style={{fontSize:56,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',margin:0,textAlign:'center'}}>
              Ready to digitise your workflow?
            </h2>
            <p style={{fontSize:24,color:'#D4A574',fontFamily:'Inter',textAlign:'center',maxWidth:700,lineHeight:1.5}}>
              Join restoration teams across Australia who have replaced spreadsheets with a platform built for their industry.
            </p>
            <button style={{
              padding:'18px 48px',borderRadius:12,border:'none',
              backgroundColor:'#8A6B4E',color:'#FFFFFF',fontSize:20,
              fontWeight:700,fontFamily:'Inter',cursor:'pointer',marginTop:20,
              boxShadow:'0 10px 40px rgba(138,107,78,0.4)',
            }}>Start Free Trial</button>
            <p style={{fontSize:16,color:'#94a3b8',fontFamily:'Inter',marginTop:12}}>No credit card required. 14-day full access.</p>
          </div>
        </ScreenContainer>
      </div>

      {/* Outro */}
      <div style={{position: 'absolute', inset: 0, opacity: outroOp, zIndex: outroOp > 0 ? 100 : 0}}>
        <OutroSlide title="restoreassist.com.au" subtitle="RestoreAssist — Built for Restoration" />
      </div>
    </AbsoluteFill>
  );
};

const FeatureCard: React.FC<{icon: string; title: string; desc: string; highlight: string}> = ({icon, title, desc, highlight}) => (
  <div style={{
    backgroundColor:'rgba(138,107,78,0.1)',
    border:'2px solid #8A6B4E',
    borderRadius:20,
    padding:'40px 50px',
    maxWidth:700,
    textAlign:'center',
  }}>
    <div style={{fontSize:56,marginBottom:16}}>{icon}</div>
    <h3 style={{fontSize:28,fontWeight:700,color:'#D4A574',fontFamily:'Inter',margin:'0 0 12px'}}>{title}</h3>
    <p style={{fontSize:18,color:'#FFFFFF',fontFamily:'Inter',lineHeight:1.6,margin:'0 0 8px'}}>{desc}</p>
    <span style={{fontSize:16,color:'#8A6B4E',fontFamily:'Inter',fontWeight:600}}>→ {highlight}</span>
  </div>
);
