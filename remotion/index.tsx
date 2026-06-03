import React from 'react';
import {Composition} from 'remotion';
import {DashboardWalkthrough} from './compositions/dashboard-walkthrough';
import {CreateInspection} from './compositions/create-inspection';
import {ReportBuilder} from './compositions/report-builder';
import {ClientPortal} from './compositions/client-portal';

export const RemotionRoot: React.FC = () => {
  return React.createElement(React.Fragment, null,
    React.createElement(Composition, {
      id: 'DashboardWalkthrough',
      component: DashboardWalkthrough,
      durationInFrames: 900,
      fps: 30,
      width: 1920,
      height: 1080,
      defaultProps: {
        title: 'RestoreAssist Dashboard — Quick Tour',
        stepDurations: [120, 150, 150, 120, 120, 120, 120],
      }
    }),
    React.createElement(Composition, {
      id: 'CreateInspection',
      component: CreateInspection,
      durationInFrames: 1200,
      fps: 30,
      width: 1920,
      height: 1080,
      defaultProps: {
        title: 'Creating Your First Inspection',
        stepDurations: [150, 180, 150, 150, 150, 150, 180, 150, 100],
      }
    }),
    React.createElement(Composition, {
      id: 'ReportBuilder',
      component: ReportBuilder,
      durationInFrames: 1050,
      fps: 30,
      width: 1920,
      height: 1080,
      defaultProps: {
        title: 'Building a Professional Report',
        stepDurations: [150, 150, 180, 150, 150, 150, 120],
      }
    }),
    React.createElement(Composition, {
      id: 'ClientPortal',
      component: ClientPortal,
      durationInFrames: 900,
      fps: 30,
      width: 1920,
      height: 1080,
      defaultProps: {
        title: 'Sharing Reports via Client Portal',
        stepDurations: [120, 150, 180, 150, 150, 150],
      }
    })
  );
};
