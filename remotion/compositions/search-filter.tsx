import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';
import {ScreenContainer} from '../components/shared';

export const SearchFilter = () => {
  const frame = useCurrentFrame();
  const introOp = interpolate(frame, [0, 30, 540, 570], [0, 1, 1, 0]);
  const mainOp = interpolate(frame, [550, 580, 1650, 1680], [0, 1, 1, 0]);
  const outroOp = interpolate(frame, [1660, 1710, 1950, 1980], [0, 1, 1, 1]);

  const filters = [
    {title:'Date Range',desc:'From/to calendar picker. Preset ranges: Today, This Week, This Month, Last 90 Days, Custom.'},
    {title:'Status',desc:'Draft, In Progress, Review, Complete, Archived. Multi-select with OR logic.'},
    {title:'Technician',desc:'Filter by assigned staff. Show unassigned jobs. Group by team member workload.'},
    {title:'Location',desc:'Search by suburb, postcode, or radius from GPS point. Map view integration.'},
    {title:'Client',desc:'Quick search by company name, contact, or client code. Favourites list.'},
    {title:'Damage Type',desc:'Water, Fire, Mould, Storm, Structural. Multi-select with severity override.'},
  ];

  const power = [
    {label:'Full-text search',desc:'Search inside notes, descriptions, and custom fields. PostgreSQL GIN indexed.'},
    {label:'Saved filters',desc:'Bookmark common combinations. One-click recall. Share with team.'},
    {label:'Export results',desc:'Export any filtered view to CSV. Open in Excel. Maintain filters in export.'},
  ];

  return (
    <AbsoluteFill>
      <div style={{position:'absolute',inset:0,opacity:introOp,zIndex:introOp>0?100:0}}>
        <IntroSlide title="Advanced Search & Filter" subtitle="Find any inspection in under 3 seconds." />
      </div>
      <div style={{position:'absolute',inset:0,opacity:mainOp,zIndex:mainOp>0?10:0}}>
        <ScreenContainer>
          <div style={{width:'100%',height:'100%',padding:'50px 80px',display:'flex',flexDirection:'column',gap:18}}>
            <div style={{fontSize:28,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter'}}>Search Filters</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
              {filters.map(f => (
                <div key={f.title} style={{padding:18,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid rgba(138,107,78,0.25)',display:'flex',flexDirection:'column'}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:6}}>{f.title}</div>
                  <div style={{fontSize:11,color:'#D4A574',fontFamily:'Inter',lineHeight:1.4}}>{f.desc}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:18,fontWeight:700,color:'#FFFFFF',fontFamily:'Inter',marginTop:6}}>Power Features</div>
            <div style={{display:'flex',gap:14}}>
              {power.map(p => (
                <div key={p.label} style={{flex:1,padding:18,backgroundColor:'#1C2E47',borderRadius:10,border:'1px solid #8A6B4E'}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#FFF',fontFamily:'Inter',marginBottom:4}}>{p.label}</div>
                  <div style={{fontSize:12,color:'#D4A574',fontFamily:'Inter'}}>{p.desc}</div>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',fontSize:13,color:'#D4A574',fontFamily:'Inter',marginTop:'auto'}}>
              Results appear in real-time as you type. No page reload. Sub-second response.
            </div>
          </div>
        </ScreenContainer>
      </div>
      <div style={{position:'absolute',inset:0,opacity:outroOp,zIndex:outroOp>0?100:0}}>
        <OutroSlide title="Find it fast. Move on." subtitle="Search that actually works." />
      </div>
    </AbsoluteFill>
  );
};
