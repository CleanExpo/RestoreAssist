import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../../components/shared';
import {IntroSlide} from '../ui-elements/intro-slide';
import {OutroSlide} from '../ui-elements/outro-slide';

export const SignIn = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0, d1, d2, d3] = stepDurations;
  const s0 = 0, s1 = s0 + d0, s2 = s1 + d1, s3 = s2 + d2, s4 = s3 + d3;

  const introOpacity = interpolate(frame, [s0, s0 + 20, s1 - 20, s1], [1, 1, 1, 0]);
  const outroOpacity = interpolate(frame, [s4, s4 + 10, s4 + 25, s4 + 40], [0, 1, 1, 1]);
  const mainOpacity = interpolate(frame, [s1 - 10, s1], [0, 1]);

  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', inset: 0, opacity: introOpacity, zIndex: introOpacity > 0 ? 100 : 0}}>
        <IntroSlide title={title} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: mainOpacity, zIndex: 10}}>
        <ScreenContainer>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            backgroundColor: '#0A0A0A',
          }}>
            <div style={{
              width: 480,
              backgroundColor: '#ffffff',
              borderRadius: 16,
              border: '1px solid #2A3A55',
              padding: 40,
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            }}>
              <div style={{textAlign: 'center', marginBottom: 32}}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14, backgroundColor: '#8A6B4E',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, marginBottom: 16,
                }}><img src='/logo.png' style={{width: 40, height: 'auto', objectFit: 'contain'}} /></div>
                <h2 style={{fontSize: 22, fontWeight: 700, color: '#1C2E47', margin: 0, fontFamily: 'Inter'}}>Welcome Back</h2>
                <p style={{fontSize: 14, color: '#8A6B4E', marginTop: 8, fontFamily: 'Inter'}}>Sign in to your RestoreAssist account.</p>
              </div>

              <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                <div>
                  <label style={{display: 'block', fontSize: 13, fontWeight: 600, color: '#1C2E47', marginBottom: 6, fontFamily: 'Inter'}}>Email Address</label>
                  <div style={{
                    padding: '12px 16px', borderRadius: 8, border: '1px solid #2A3A55',
                    backgroundColor: '#ffffff', fontSize: 14, color: '#1C2E47', fontFamily: 'Inter',
                  }}>contact@cleanexpo.com</div>
                </div>
                <div>
                  <label style={{display: 'block', fontSize: 13, fontWeight: 600, color: '#1C2E47', marginBottom: 6, fontFamily: 'Inter'}}>Password</label>
                  <div style={{
                    padding: '12px 16px', borderRadius: 8, border: '1px solid #2A3A55',
                    backgroundColor: '#ffffff', fontSize: 14, color: '#1C2E47', fontFamily: 'Inter',
                  }}>••••••••••••</div>
                </div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#1C2E47', fontFamily: 'Inter', cursor: 'pointer'}}>
                    <input type="checkbox" checked style={{accentColor: '#8A6B4E'}} />
                    Remember me
                  </label>
                  <span style={{fontSize: 13, color: '#8A6B4E', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter'}}>Forgot password?</span>
                </div>
                <button style={{
                  width: '100%', padding: '14px', borderRadius: 8, border: 'none',
                  backgroundColor: '#8A6B4E', color: '#ffffff', fontSize: 16,
                  fontWeight: 700, fontFamily: 'Inter', cursor: 'pointer', marginTop: 8,
                }}>Sign In</button>
                <div style={{
                  padding: '14px', borderRadius: 8, border: '1px solid #2A3A55',
                  backgroundColor: '#ffffff', color: '#1C2E47', fontSize: 16,
                  fontWeight: 600, fontFamily: 'Inter', textAlign: 'center',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                  <span style={{fontSize: 20}}>🔐</span>
                  Sign in with SSO
                </div>
              </div>

              <div style={{marginTop: 20, fontSize: 13, color: '#D4A574', textAlign: 'center', fontFamily: 'Inter'}}>
                Need an account? <span style={{color: '#8A6B4E', fontWeight: 600, cursor: 'pointer'}}>Sign Up</span>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>

      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s1 && frame < s2 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={960} startY={600} endX={720} endY={340} startFrame={s1 + 20} endFrame={s1 + 50} />
        <Annotation text="Enter your registered email address." x={580} y={310} startFrame={s1 + 35} endFrame={s1 + 120} />
      </div>

      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s2 && frame < s3 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={720} startY={340} endX={720} endY={440} startFrame={s2 + 20} endFrame={s2 + 50} clickFrame={s2 + 48} />
        <HighlightBox x={680} y={410} width={360} height={56} startFrame={s2 + 45} endFrame={s2 + 75} />
        <Annotation text="Enter your password securely." x={580} y={380} startFrame={s2 + 35} endFrame={s2 + 130} />
      </div>

      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s3 && frame < s4 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={720} startY={440} endX={720} endY={540} startFrame={s3 + 20} endFrame={s3 + 50} clickFrame={s3 + 48} />
        <HighlightBox x={660} y={510} width={400} height={56} startFrame={s3 + 45} endFrame={s3 + 75} />
        <Annotation text="Or sign in with your company\'s SSO provider." x={580} y={480} startFrame={s3 + 35} endFrame={s3 + 150} />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: outroOpacity, zIndex: outroOpacity > 0 ? 100 : 0}}>
        <OutroSlide title="Welcome back to RestoreAssist." subtitle="RestoreAssist" />
      </div>
    </AbsoluteFill>
  );
};
