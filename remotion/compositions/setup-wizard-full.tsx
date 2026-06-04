import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const SetupWizardFull = () => {
  const frame = useCurrentFrame();

  const steps = [
    {id:0, start:0,    end:300,  title:'Complete Setup Walkthrough'},
    {id:1, start:320,  end:720,  title:'Step 1: Create Your Account'},
    {id:2, start:740,  end:1340, title:'Step 2: Configure Your Company'},
    {id:3, start:1360, end:1960, title:'Step 3: Set Up Integrations'},
    {id:4, start:1980, end:2780, title:'Step 4: Create Your First Inspection'},
    {id:5, start:2800, end:3500, title:'Step 5: Build & Export a Report'},
    {id:6, start:3520, end:4300, title:'Step 6: Invite Your Team'},
    {id:7, start:4320, end:5000, title:'Dashboard Overview'},
    {id:8, start:5020, end:5400, title:'You are Ready!'},
  ];

  const stepIndex = steps.findIndex(s => frame >= s.start && frame < s.end);
  const activeStep = steps[Math.max(0, stepIndex)];

  const introOp = interpolate(frame, [0, 30, 260, 300], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [5020, 5060, 5360, 5400], [0, 1, 1, 1]);

  return (
    <AbsoluteFill style={{backgroundColor:'#050505'}}>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Complete Setup Walkthrough" subtitle="From signup to first inspection in under 3 minutes" />
      </div>

      {(frame > 300 && frame < 5020) && (
        <div style={{position:'absolute',bottom:40,left:80,right:80,zIndex:200}}>
          <div style={{height:6,backgroundColor:'rgba(138,107,78,0.2)',borderRadius:3}}>
            <div style={{height:'100%',width:`${(activeStep.id/steps.length)*100}%`,backgroundColor:'#8A6B4E',borderRadius:3,transition:'width 0.5s'}} />
          </div>
        </div>
      )}

      {steps.map(step => {
        const op = interpolate(frame, [step.start-20, step.start, step.end-30, step.end+10], [0,1,1,0]);
        if (op <= 0) return null;
        return (
          <div key={step.id} style={{position:'absolute',inset:0,opacity:op,zIndex:op>0?10:0}}>
            <ScreenContainer>
              <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',padding:'60px 80px'}}>
                <StepHeader step={step.id+1} total={steps.length} title={step.title} />
                <StepBody step={step.id} />
              </div>
            </ScreenContainer>
          </div>
        );
      })}

      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Setup complete." subtitle="Your first inspection is just a tap away." />
      </div>
    </AbsoluteFill>
  );
};

const StepHeader: React.FC<{step:number;total:number;title:string}> = ({step,total,title}) => (
  <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:40}}>
    <div style={{width:48,height:48,borderRadius:12,backgroundColor:'#8A6B4E',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,color:'#FFF',fontFamily:'Inter'}}>
      {step}/{total}
    </div>
    <div>
      <div style={{fontSize:14,color:'#8A6B4E',fontFamily:'Inter',fontWeight:600}}>Step {step} of {total}</div>
      <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>{title}</div>
    </div>
  </div>
);

const StepBody: React.FC<{step:number}> = ({step}) => {
  switch (step) {
    case 0: return <StepAccount />;
    case 1: return <StepCompany />;
    case 2: return <StepIntegrations />;
    case 3: return <StepInspection />;
    case 4: return <StepReport />;
    case 5: return <StepTeam />;
    case 6: return <StepDashboard />;
    default: return null;
  }
};

const MockCard: React.FC<{children:React.ReactNode;slim?:boolean;wide?:boolean}> = ({children,slim,wide}) => (
  <div style={{backgroundColor:'#FFF',borderRadius:16,padding:28,width:wide?700:slim?320:420,boxShadow:'0 4px 24px rgba(0,0,0,0.08)'}}>{children}</div>
);

const MockField: React.FC<{label:string;value:string;type?:'text'|'select'}> = ({label,value,type='text'}) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:12,fontWeight:600,color:'#1C2E47',marginBottom:6,fontFamily:'Inter'}}>{label}</div>
    <div style={{padding:'12px 16px',borderRadius:8,border:'1px solid #e2e8f0',backgroundColor:'#f8fafc',fontSize:14,color:'#1C2E47',fontFamily:'Inter',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      {value}
      {type==='select' && <span style={{color:'#8A6B4E'}}>▼</span>}
    </div>
  </div>
);

const DashCard: React.FC<{title:string;value:string;change:string;color?:string}> = ({title,value,change,color='#8A6B4E'}) => (
  <div style={{backgroundColor:'#1C2E47',borderRadius:16,padding:24,minWidth:180,border:'1px solid rgba(138,107,78,0.3)'}}>
    <div style={{fontSize:12,color:'#D4A574',marginBottom:8,fontFamily:'Inter'}}>{title}</div>
    <div style={{fontSize:32,fontWeight:700,color:'#FFF',marginBottom:4,fontFamily:'Inter'}}>{value}</div>
    <div style={{fontSize:12,color:color,fontFamily:'Inter'}}>{change}</div>
  </div>
);

// Individual step components
const StepAccount = () => (
  <div style={{display:'flex',flexDirection:'column',gap:20,alignItems:'center',justifyContent:'center',flex:1}}>
    <MockCard>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:22,fontWeight:700,color:'#1C2E47',marginBottom:8,fontFamily:'Inter'}}>Create your account</div>
        <MockField label="Full Name" value="Phill McGurk" />
        <MockField label="Email" value="phill@restoreassist.com.au" />
        <MockField label="Company" value="CleanExpo Restoration" type="select" />
        <div style={{padding:'14px',borderRadius:8,backgroundColor:'#8A6B4E',color:'#FFF',fontSize:16,fontWeight:700,textAlign:'center',fontFamily:'Inter',marginTop:12}}>Create Account</div>
      </div>
    </MockCard>
  </div>
);

const StepCompany = () => (
  <div style={{display:'flex',gap:40,alignItems:'center',justifyContent:'center',flex:1}}>
    <MockCard>
      <div style={{fontSize:20,fontWeight:700,color:'#1C2E47',marginBottom:16,fontFamily:'Inter'}}>Company Settings</div>
      <MockField label="Company Name" value="CleanExpo Restoration Pty Ltd" />
      <MockField label="ABN" value="12 345 678 901" />
      <MockField label="Primary Trade" value="Water Damage Restoration" type="select" />
      <MockField label="State" value="New South Wales" type="select" />
    </MockCard>
    <MockCard slim>
      <div style={{fontSize:18,fontWeight:700,color:'#8A6B4E',marginBottom:12,fontFamily:'Inter'}}>Auto-filled from...</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {['Xero','MYOB','QuickBooks'].map(name => (
          <div key={name} style={{padding:'10px 16px',borderRadius:8,backgroundColor:'rgba(138,107,78,0.1)',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:18}}>☁️</span>
            <span style={{fontSize:14,color:'#1C2E47',fontFamily:'Inter',fontWeight:600}}>{name}</span>
            <span style={{marginLeft:'auto',fontSize:12,color:'#8A6B4E',fontFamily:'Inter'}}>Connect →</span>
          </div>
        ))}
      </div>
    </MockCard>
  </div>
);

const StepIntegrations = () => (
  <div style={{display:'flex',gap:30,alignItems:'center',justifyContent:'center',flex:1}}>
    {[
      {name:'Xero',icon:'📗',status:'Connected'},
      {name:'ServiceM8',icon:'🔧',status:'Connect'},
      {name:'QuickBooks',icon:'📘',status:'Connect'},
      {name:'Ascora',icon:'🛠️',status:'Connect'},
      {name:'MYOB',icon:'📙',status:'Connect'},
    ].map(app => (
      <div key={app.name} style={{width:160,backgroundColor:'#FFF',borderRadius:16,padding:24,border:app.status==='Connected'?'2px solid #22c55e':'2px solid #2A3A55',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        <div style={{fontSize:36}}>{app.icon}</div>
        <div style={{fontSize:16,fontWeight:700,color:'#1C2E47',fontFamily:'Inter'}}>{app.name}</div>
        <div style={{fontSize:12,fontWeight:700,padding:'6px 14px',borderRadius:6,backgroundColor:app.status==='Connected'?'#dcfce7':'#f1f5f9',color:app.status==='Connected'?'#166534':'#1C2E47',fontFamily:'Inter'}}>{app.status}</div>
      </div>
    ))}
  </div>
);

const StepInspection = () => (
  <div style={{display:'flex',gap:30,alignItems:'flex-start',justifyContent:'center',flex:1}}>
    <MockCard>
      <div style={{fontSize:20,fontWeight:700,color:'#1C2E47',marginBottom:16,fontFamily:'Inter'}}>New Inspection</div>
      <MockField label="Client" value="Sarah Johnson" />
      <MockField label="Property Address" value="42 Smith St, Sydney NSW 2000" />
      <MockField label="Job Type" value="Category 3 Water Loss" type="select" />
      <MockField label="Insurance Claim #" value="IAG-2026-08472" />
      <div style={{display:'flex',gap:12,marginTop:16}}>
        {['Photo 1','Photo 2','Photo 3'].map(p => (
          <div key={p} style={{width:80,height:80,backgroundColor:'#e2e8f0',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>📷</div>
        ))}
        <div style={{width:80,height:80,borderRadius:8,border:'2px dashed #8A6B4E',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>+</div>
      </div>
    </MockCard>
    <MockCard slim>
      <div style={{fontSize:18,fontWeight:700,color:'#8A6B4E',marginBottom:12,fontFamily:'Inter'}}>Inspection Checklist</div>
      {['Initial moisture reading','Photo all affected areas','Document source category','Note structural concerns','Client signature'].map((item,i) => (
        <div key={item} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid #e2e8f0'}}>
          <div style={{width:20,height:20,borderRadius:'50%',backgroundColor:i<2?'#22c55e':'#e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10}}>{i<2?'✓':''}</div>
          <span style={{fontSize:14,color:'#1C2E47',fontFamily:'Inter'}}>{item}</span>
        </div>
      ))}
    </MockCard>
  </div>
);

const StepReport = () => (
  <div style={{display:'flex',gap:30,alignItems:'flex-start',justifyContent:'center',flex:1}}>
    <MockCard wide>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:700,color:'#1C2E47',fontFamily:'Inter'}}>S500 Moisture Report</div>
        <div style={{padding:'8px 16px',borderRadius:6,backgroundColor:'#8A6B4E',color:'#FFF',fontSize:14,fontWeight:600,fontFamily:'Inter'}}>Export PDF</div>
      </div>
      <div style={{display:'flex',gap:20,marginBottom:20}}>
        <div style={{flex:1,padding:16,backgroundColor:'#f1f5f9',borderRadius:8}}>
          <div style={{fontSize:12,color:'#8A6B4E',marginBottom:4}}>Initial Reading</div>
          <div style={{fontSize:24,fontWeight:700,color:'#1C2E47'}}>85.4%</div>
        </div>
        <div style={{flex:1,padding:16,backgroundColor:'#f1f5f9',borderRadius:8}}>
          <div style={{fontSize:12,color:'#8A6B4E',marginBottom:4}}>Dry Goal</div>
          <div style={{fontSize:24,fontWeight:700,color:'#22c55e'}}>&le;16%</div>
        </div>
        <div style={{flex:1,padding:16,backgroundColor:'#f1f5f9',borderRadius:8}}>
          <div style={{fontSize:12,color:'#8A6B4E',marginBottom:4}}>Status</div>
          <div style={{fontSize:24,fontWeight:700,color:'#ef4444'}}>Active</div>
        </div>
      </div>
      <div style={{fontSize:14,color:'#1C2E47',fontFamily:'Inter',lineHeight:1.6}}>
        <strong>Standard Reference:</strong> IICRC S500-2021, Section 12.3.1<br/>
        <strong>Category:</strong> Category 3 — Grossly Contaminated Water<br/>
        <strong>Technician:</strong> Phill McGurk (Cert. #RE-2847)
      </div>
    </MockCard>
  </div>
);

const StepTeam = () => (
  <div style={{display:'flex',gap:30,alignItems:'center',justifyContent:'center',flex:1}}>
    <MockCard>
      <div style={{fontSize:20,fontWeight:700,color:'#1C2E47',marginBottom:16,fontFamily:'Inter'}}>Invite Team Members</div>
      <MockField label="Email Address" value="tech@cleanexpo.com.au" />
      <MockField label="Role" value="Field Technician" type="select" />
      <MockField label="Licence Number" value="NSW-RM-48291" />
      <div style={{padding:'14px',borderRadius:8,backgroundColor:'#8A6B4E',color:'#FFF',fontSize:16,fontWeight:700,textAlign:'center',fontFamily:'Inter',marginTop:12}}>Send Invitation</div>
    </MockCard>
    <MockCard slim>
      <div style={{fontSize:18,fontWeight:700,color:'#8A6B4E',marginBottom:12,fontFamily:'Inter'}}>Team (3)</div>
      {[
        {name:'Phill McGurk',role:'Admin',status:'Active'},
        {name:'Sarah Chen',role:'Technician',status:'Active'},
        {name:'Mike Torres',role:'Technician',status:'Pending'},
      ].map(member => (
        <div key={member.name} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid #e2e8f0'}}>
          <div style={{width:36,height:36,borderRadius:'50%',backgroundColor:'#8A6B4E',display:'flex',alignItems:'center',justifyContent:'center',color:'#FFF',fontSize:14,fontWeight:700,fontFamily:'Inter'}}>{member.name[0]}</div>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:'#1C2E47',fontFamily:'Inter'}}>{member.name}</div>
            <div style={{fontSize:12,color:'#8A6B4E',fontFamily:'Inter'}}>{member.role}</div>
          </div>
          <div style={{marginLeft:'auto',fontSize:12,padding:'4px 10px',borderRadius:4,backgroundColor:member.status==='Active'?'#dcfce7':'#fef3c7',color:member.status==='Active'?'#166534':'#92400e',fontFamily:'Inter',fontWeight:600}}>{member.status}</div>
        </div>
      ))}
    </MockCard>
  </div>
);

const StepDashboard = () => (
  <div style={{display:'flex',gap:20,alignItems:'flex-start',justifyContent:'center',flex:1,flexWrap:'wrap'}}>
    <DashCard title="Active Inspections" value="12" change="+3 this week" />
    <DashCard title="Reports Due" value="5" change="2 overdue" color="#ef4444" />
    <DashCard title="Team Members" value="8" change="1 pending invite" />
    <DashCard title="This Month" value="$24,500" change="vs $18,200 last month" />
    <DashCard title="Compliance Score" value="96%" change="All certifications current" color="#22c55e" />
  </div>
);
