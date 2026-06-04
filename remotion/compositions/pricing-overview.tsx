import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

export const PricingOverview = () => {
  const frame = useCurrentFrame();

  const heroOpacity = interpolate(frame, [0,25,110,140], [0,1,1,0]);
  const plansOpacity = interpolate(frame, [110,140,400,430], [0,1,1,0]);
  const featuresOpacity = interpolate(frame, [380,410,540,570], [0,1,1,0]);
  const ctaOpacity = interpolate(frame, [520,550,680,710], [0,1,1,0]);

  const plans = [
    {name:'Starter', price:'$49', period:'/mo', jobs:'5 jobs/month', features:['Inspections','Basic Reports','Client Portal','Email Support'], cta:'Start Free Trial', color:'#1C2E47'},
    {name:'Professional', price:'$149', period:'/mo', jobs:'Unlimited jobs', features:['Everything in Starter','Advanced Reports','Moisture Mapping','BYOK Equipment','Priority Support'], cta:'Most Popular', color:'#8A6B4E', popular:true},
    {name:'Enterprise', price:'Custom', period:'', jobs:'Unlimited everything', features:['Everything in Pro','White-label Portal','API Access','SSO','Dedicated Account Manager'], cta:'Contact Sales', color:'#1C2E47'},
  ];

  return (
    <AbsoluteFill style={{fontFamily:'Inter, sans-serif'}}>
      {/* Hero */}
      <div style={{position:'absolute', inset:0, opacity:heroOpacity}}>
        <AbsoluteFill style={{backgroundColor:'#1C2E47', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
          <h1 style={{fontSize:56, fontWeight:800, color:'#ffffff', textAlign:'center', margin:0}}>Simple, Transparent Pricing</h1>
          <p style={{fontSize:20, color:'#8A6B4E', marginTop:20, textAlign:'center', maxWidth:600}}>Start free. Scale as your restoration business grows. No hidden fees.</p>
        </AbsoluteFill>
      </div>

      {/* Plans */}
      <div style={{position:'absolute', inset:0, opacity:plansOpacity}}>
        <AbsoluteFill style={{backgroundColor:'#0A0A0A', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60}}>
          <div style={{display:'flex', gap:24, maxWidth:1200}}>
            {plans.map((plan,i) => (
              <div key={plan.name} style={{
                flex:1, padding:32, borderRadius:16,
                backgroundColor:plan.popular?'#8A6B4E':'#ffffff',
                border:'2px solid ' + (plan.popular?'#8A6B4E':'#2A3A55'),
                position:'relative',
                opacity:interpolate(frame-150-i*15,[0,20],[0,1],{extrapolateLeft:'clamp'})
              }}>
                {plan.popular && <div style={{position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)', padding:'4px 16px', borderRadius:12, backgroundColor:'#ffffff', color:'#8A6B4E', fontSize:12, fontWeight:700}}>MOST POPULAR</div>}
                <h3 style={{fontSize:20, fontWeight:700, color:plan.popular?'#ffffff':'#1C2E47', marginBottom:8}}>{plan.name}</h3>
                <div style={{display:'flex', alignItems:'baseline', gap:4, marginBottom:4}}>
                  <span style={{fontSize:42, fontWeight:800, color:plan.popular?'#ffffff':'#1C2E47'}}>{plan.price}</span>
                  <span style={{fontSize:16, color:plan.popular?'#fecaca':'#8A6B4E'}}>{plan.period}</span>
                </div>
                <div style={{fontSize:14, color:plan.popular?'#fecaca':'#D4A574', marginBottom:20}}>{plan.jobs}</div>
                <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:24}}>
                  {plan.features.map(f => (
                    <div key={f} style={{display:'flex', alignItems:'center', gap:8, fontSize:14, color:plan.popular?'#ffffff':'#1C2E47'}}>
                      <span style={{color:plan.popular?'#fecaca':'#059669'}}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <button style={{
                  width:'100%', padding:'14px', borderRadius:8, border:'none',
                  backgroundColor:plan.popular?'#ffffff':plan.color, color:plan.popular?'#8A6B4E':'#ffffff',
                  fontSize:14, fontWeight:700, cursor:'pointer'
                }}>{plan.cta}</button>
              </div>
            ))}
          </div>
        </AbsoluteFill>
      </div>

      {/* CTA */}
      <div style={{position:'absolute', inset:0, opacity:ctaOpacity}}>
        <AbsoluteFill style={{backgroundColor:'#8A6B4E', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:60}}>
          <h1 style={{fontSize:42, fontWeight:800, color:'#ffffff', textAlign:'center', margin:0}}>14 Days Free. No Credit Card.</h1>
          <p style={{fontSize:18, color:'#fecaca', marginTop:16, marginBottom:32}}>Cancel anytime. All plans include onboarding support.</p>
          <button style={{padding:'18px 48px', borderRadius:12, border:'none', backgroundColor:'#ffffff', color:'#8A6B4E', fontSize:18, fontWeight:700, cursor:'pointer'}}>Start Free Trial</button>
          <div style={{marginTop:24, fontSize:14, color:'#fecaca'}}>restoreassist.app/pricing</div>
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
};
