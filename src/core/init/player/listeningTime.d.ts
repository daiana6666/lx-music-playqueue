export interface ListeningTimeTracker {
  reset: (position?: number) => void
  allowLongGap: () => void
  update: (position: number, playbackRate?: number) => number
}

export function createListeningTimeTracker(): ListeningTimeTracker
