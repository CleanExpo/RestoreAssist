export type HydrationState = 'pending' | 'running' | 'ready' | 'error' | 'manual';

const ALLOWED: Record<HydrationState, HydrationState[]> = {
  pending: ['running', 'manual'],
  running: ['ready', 'error', 'manual'],
  ready:   ['running'],
  error:   ['running', 'manual'],
  manual:  ['ready', 'running'],
};

export function canTransition(from: HydrationState, to: HydrationState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
