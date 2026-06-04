import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, Img, staticFile} from 'remotion';
import {IntroSlide} from './ui-elements/intro-slide';
import {OutroSlide} from './ui-elements/outro-slide';

interface Props {
  title: string;
  stepDurations: number[];
}

export const MoistureMapping: React.FC<Props> = ({title, stepDurations}) => {
  const frame = useCurrentFrame();
  const [d0, d1, d2, d3, d4] = stepDurations;

  const s0 = 0, s1 = s0 + d0, s2 = s1 + d1, s3 = s2 + d2, s4 = s3 + d3, s5 = s4 + d4;

  const introOpacity = interpolate(frame, [s0, s0 + 20, s1 - 20, s1], [1, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const outroOpacity = interpolate(frame, [s4, s4 + 15, s5 - 15, s5], [0, 1, 1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const mainOpacity = interpolate(frame, [s1 - 10, s1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', inset: 0, opacity: introOpacity, zIndex: introOpacity > 0 ? 100 : 0}}>
        <IntroSlide title={title} subtitle="RestoreAssist" />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: mainOpacity, zIndex: 10}}>
        <Img
          src={staticFile("screenshots/ra-ui/moisture-mapping.png")}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      </div>

      <div style={{position: 'absolute', inset: 0, opacity: outroOpacity, zIndex: outroOpacity > 0 ? 100 : 0}}>
        <OutroSlide title="Your restoration business, simplified." subtitle="RestoreAssist" />
      </div>
    </AbsoluteFill>
  );
};
