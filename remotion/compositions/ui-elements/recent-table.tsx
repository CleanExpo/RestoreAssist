import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

export const RecentTable = () => {
  const frame = useCurrentFrame();

  const rows = [
    {id: 'INS-2026-0089', client: 'Mrs Jane Smith', property: '42 Example St, Sydney', type: 'Water Damage', date: '2 Jun 2026', status: 'In Progress'},
    {id: 'INS-2026-0088', client: 'Mr John Davis', property: '15 Ocean Rd, Bondi', type: 'Fire & Smoke', date: '1 Jun 2026', status: 'Report Ready'},
    {id: 'INS-2026-0087', client: 'Supreme Cleaning', property: '200 King St, Melbourne', type: 'Mould', date: '30 May 2026', status: 'Completed'},
    {id: 'INS-2026-0086', client: 'Restoration Pro', property: '88 Bridge St, Brisbane', type: 'Sewage Backup', date: '28 May 2026', status: 'In Progress'},
    {id: 'INS-2026-0085', client: 'Elite Services', property: '5 Park Ave, Perth', type: 'Storm Damage', date: '25 May 2026', status: 'Completed'},
  ];

  const statusColors = {
    'In Progress': '#f59e0b',
    'Report Ready': '#059669',
    'Completed': '#8A6B4E',
  };

  return (
    <div>
      <table style={{width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif'}}>
        <thead>
          <tr>
            {['ID','Client','Property','Hazard Type','Date','Status'].map((h, i) => (
              <th key={h} style={{
                textAlign: 'left',
                padding: '10px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: '#8A6B4E',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #2A3A55',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row.id} style={{
              opacity: interpolate(frame - ri * 12, [0, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
            }}>
              <td style={{padding: '12px', fontSize: 13, fontWeight: 600, color: '#1C2E47', borderBottom: '1px solid #f1f5f9'}}>{row.id}</td>
              <td style={{padding: '12px', fontSize: 13, color: '#1C2E47', borderBottom: '1px solid #f1f5f9'}}>{row.client}</td>
              <td style={{padding: '12px', fontSize: 13, color: '#1C2E47', borderBottom: '1px solid #f1f5f9'}}>{row.property}</td>
              <td style={{padding: '12px', fontSize: 13, color: '#1C2E47', borderBottom: '1px solid #f1f5f9'}}>{row.type}</td>
              <td style={{padding: '12px', fontSize: 13, color: '#8A6B4E', borderBottom: '1px solid #f1f5f9'}}>{row.date}</td>
              <td style={{padding: '12px', borderBottom: '1px solid #f1f5f9'}}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: statusColors[row.status],
                  backgroundColor: statusColors[row.status] + '20',
                  padding: '4px 12px',
                  borderRadius: 12,
                }}>{row.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
