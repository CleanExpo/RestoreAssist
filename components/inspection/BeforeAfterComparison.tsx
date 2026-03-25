'use client'

import {
  ReactCompareSlider,
  ReactCompareSliderImage,
  ReactCompareSliderHandle,
} from 'react-compare-slider'

interface BeforeAfterComparisonProps {
  beforeUrl: string
  afterUrl: string
  beforeDate?: string
  afterDate?: string
}

export default function BeforeAfterComparison({
  beforeUrl,
  afterUrl,
  beforeDate,
  afterDate,
}: BeforeAfterComparisonProps) {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-slate-800/50 backdrop-blur-sm border border-slate-700/50">
      <ReactCompareSlider
        handle={
          <ReactCompareSliderHandle
            buttonStyle={{
              backdropFilter: 'none',
              background: '#06b6d4',
              border: '2px solid #fff',
              color: '#fff',
              width: 36,
              height: 36,
              boxShadow: '0 0 12px rgba(6, 182, 212, 0.4)',
            }}
            linesStyle={{
              opacity: 0.6,
              color: '#06b6d4',
            }}
          />
        }
        itemOne={
          <div className="relative w-full h-full">
            <ReactCompareSliderImage
              src={beforeUrl}
              alt="Before"
              style={{ objectFit: 'cover', width: '100%', height: '100%' }}
            />
            {/* Before date stamp */}
            {beforeDate && (
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-xs font-medium text-white pointer-events-none">
                Before &middot; {beforeDate}
              </div>
            )}
          </div>
        }
        itemTwo={
          <div className="relative w-full h-full">
            <ReactCompareSliderImage
              src={afterUrl}
              alt="After"
              style={{ objectFit: 'cover', width: '100%', height: '100%' }}
            />
            {/* After date stamp */}
            {afterDate && (
              <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-xs font-medium text-white pointer-events-none">
                After &middot; {afterDate}
              </div>
            )}
          </div>
        }
        className="aspect-video w-full"
      />
    </div>
  )
}
