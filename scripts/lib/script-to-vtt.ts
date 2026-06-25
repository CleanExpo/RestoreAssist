export interface VttSegment {
  text: string;
  startSec: number;
  durationSec: number;
}

function fmt(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const ms = Math.round((totalSec - Math.floor(totalSec)) * 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

export function segmentsToVtt(segments: VttSegment[]): string {
  const cues = segments.map((seg) => {
    const start = fmt(seg.startSec);
    const end = fmt(seg.startSec + seg.durationSec);
    return `${start} --> ${end}\n${seg.text}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
