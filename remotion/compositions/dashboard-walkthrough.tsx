import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {AnimatedMouse, HighlightBox, ScreenContainer, Annotation} from '../components/shared';
import {Sidebar} from './ui-elements/sidebar';
import {TopBar} from './ui-elements/top-bar';
import {StatCard} from './ui-elements/stat-card';
import {RecentTable} from './ui-elements/recent-table';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

interface Props {
  title: string;
  stepDurations: number[];
}

export const DashboardWalkthrough: React.FC<Props> = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0, d1, d2, d3, d4, d5] = stepDurations;

  const s0 = 0, s1 = s0 + d0, s2 = s1 + d1, s3 = s2 + d2, s4 = s3 + d3, s5 = s4 + d4, s6 = s5 + d5;

  const introOpacity = interpolate(frame, [s0, s0 + 20, s1 - 20, s1], [1, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const outroOpacity = interpolate(frame, [s5, s5 + 15, s6 - 15, s6], [0, 1, 1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const mainOpacity = interpolate(frame, [s1 - 10, s1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* Intro */}
      <div style={{position: 'absolute', inset: 0, opacity: introOpacity, zIndex: introOpacity > 0 ? 100 : 0}}>
        <IntroSlide title={title} />
      </div>

      {/* Main Content */}
      <div style={{position: 'absolute', inset: 0, opacity: mainOpacity, zIndex: 10}}>
        <ScreenContainer>
          <div style={{display: 'flex', width: '100%', height: '100%'}}>
            <Sidebar activeItem="dashboard" frame={frame} startFrame={s1 + 10} endFrame={s3} />

            <div style={{flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
              <TopBar />

              <div style={{padding: 32, flex: 1, overflow: 'auto'}}>
                {/* Page Header */}
                <div style={{marginBottom: 24}}>
                  <h1 style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: '#1C2E47',
                    margin: 0,
                    fontFamily: 'Inter, -apple-system, sans-serif',
                  }}>Dashboard</h1>
                  <p style={{
                    fontSize: 14,
                    color: '#8A6B4E',
                    marginTop: 4,
                    fontFamily: 'Inter, -apple-system, sans-serif',
                  }}>Welcome back — here's what's happening in your restoration business.</p>
                </div>

                {/* Stats Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 20,
                  marginBottom: 24,
                  opacity: frame > s3 ? 1 : 0,
                  transition: 'opacity 0.5s',
                }}>
                  <StatCard
                    title="Total Inspections"
                    value="24"
                    change="+12% this month"
                    changePositive={true}
                    icon="📋"
                    highlight={frame >= s3 && frame < s4}
                  />
                  <StatCard
                    title="Reports Generated"
                    value="18"
                    change="+8% this month"
                    changePositive={true}
                    icon="📄"
                    highlight={frame >= s3 && frame < s4}
                    delay={30}
                  />
                  <StatCard
                    title="Active Clients"
                    value="12"
                    change="+3 new this week"
                    changePositive={true}
                    icon="👥"
                    highlight={frame >= s3 && frame < s4}
                    delay={60}
                  />
                  <StatCard
                    title="Revenue (MTD)"
                    value="$43,200"
                    change="+15% vs. last month"
                    changePositive={true}
                    icon="💰"
                    highlight={frame >= s3 && frame < s4}
                    delay={90}
                  />
                </div>

                {/* Quick Actions + Recent */}
                <div style={{display: 'flex', gap: 20}}>
                  {/* Quick Actions */}
                  <div style={{
                    width: 280,
                    backgroundColor: '#ffffff',
                    borderRadius: 12,
                    border: '1px solid #2A3A55',
                    padding: 20,
                    opacity: frame > s5 ? 1 : 0,
                    transition: 'opacity 0.5s',
                  }}>
                    <h3 style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#1C2E47',
                      margin: '0 0 16px 0',
                      fontFamily: 'Inter, -apple-system, sans-serif',
                    }}>Quick Actions</h3>
                    <QuickActionButton label="New Inspection" icon="📋" color="#8A6B4E" id="action-inspection" />
                    <QuickActionButton label="New Report" icon="📄" color="#2563eb" id="action-report" />
                    <QuickActionButton label="New Client" icon="👤" color="#059669" id="action-client" />
                    <QuickActionButton label="Generate Invoice" icon="💵" color="#d97706" id="action-invoice" />
                  </div>

                  {/* Recent Inspections */}
                  <div style={{
                    flex: 1,
                    backgroundColor: '#ffffff',
                    borderRadius: 12,
                    border: '1px solid #2A3A55',
                    padding: 20,
                    opacity: frame > s4 ? 1 : 0,
                    transition: 'opacity 0.5s',
                  }}>
                    <h3 style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: '#1C2E47',
                      margin: '0 0 16px 0',
                      fontFamily: 'Inter, -apple-system, sans-serif',
                    }}>Recent Inspections</h3>
                    <RecentTable />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScreenContainer>
      </div>

      {/* Mouse Animations - Step 1: Sidebar navigation */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s1 && frame < s3 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={100} startY={150} endX={100} endY={250} startFrame={s1 + 15} endFrame={s1 + 60} clickFrame={s1 + 58} />
        <AnimatedMouse startX={100} startY={250} endX={100} endY={320} startFrame={s1 + 70} endFrame={s1 + 110} clickFrame={s1 + 108} />
        <HighlightBox x={20} y={230} width={220} height={44} startFrame={s1 + 55} endFrame={s1 + 70} />
        <HighlightBox x={20} y={300} width={220} height={44} startFrame={s1 + 105} endFrame={s1 + 120} />
        <Annotation text="Navigate through your business — inspections, reports, clients, and more." x={300} y={240} startFrame={s1 + 50} endFrame={s1 + 130} />
      </div>

      {/* Mouse Animations - Step 2: Stats cards */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s3 && frame < s4 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={200} startY={500} endX={400} endY={350} startFrame={s3 + 15} endFrame={s3 + 50} />
        <AnimatedMouse startX={400} startY={350} endX={700} endY={350} startFrame={s3 + 60} endFrame={s3 + 90} />
        <HighlightBox x={250} y={180} width={240} height={130} startFrame={s3 + 45} endFrame={s3 + 55} />
        <HighlightBox x={510} y={180} width={240} height={130} startFrame={s3 + 85} endFrame={s3 + 95} />
        <Annotation text="Track key metrics at a glance. Revenue, inspections, and client activity — all on one screen." x={450} y={150} startFrame={s3 + 40} endFrame={s3 + 100} />
      </div>

      {/* Mouse Animations - Step 3: Recent inspections */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s4 && frame < s5 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={500} startY={500} endX={700} endY={550} startFrame={s4 + 15} endFrame={s4 + 50} />
        <HighlightBox x={330} y={450} width={660} height={60} startFrame={s4 + 45} endFrame={s4 + 80} />
        <Annotation text="See all recent inspections. Click through to continue working on any job." x={450} y={420} startFrame={s4 + 40} endFrame={s4 + 90} />
      </div>

      {/* Mouse Animations - Step 4: Quick actions */}
      <div style={{position: 'absolute', inset: 0, zIndex: 1000, opacity: frame >= s5 && frame < s6 ? 1 : 0, pointerEvents: 'none'}}>
        <AnimatedMouse startX={700} startY={550} endX={180} endY={520} startFrame={s5 + 15} endFrame={s5 + 50} />
        <HighlightBox x={30} y={480} width={200} height={44} startFrame={s5 + 45} endFrame={s5 + 80} />
        <Annotation text="Jump straight into work — create inspections, reports, or clients in one click." x={260} y={500} startFrame={s5 + 40} endFrame={s5 + 90} />
      </div>

      {/* Outro */}
      <div style={{position: 'absolute', inset: 0, opacity: outroOpacity, zIndex: outroOpacity > 0 ? 100 : 0}}>
        <OutroSlide title="Your restoration business, simplified." subtitle="RestoreAssist" />
      </div>
    </AbsoluteFill>
  );
};

const QuickActionButton: React.FC<{label: string; icon: string; color: string; id: string}> = ({label, icon, color}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      borderRadius: 8,
      backgroundColor: '#0A0A0A',
      marginBottom: 8,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      color: '#1C2E47',
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <span style={{fontSize: 18}}>{icon}</span>
      {label}
    </div>
  );
};
