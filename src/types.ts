export type Phase = 'WORK' | 'REST' | 'TRANSITION';

export interface TimerBlock {
  id: string;
  name: string;
  workTime: number; // seconds
  restTime: number; // seconds
  reps: number;
}

export interface WorkoutPreset {
  id: string;
  name: string;
  blocks: TimerBlock[];
  transitionTime: number; // seconds between blocks
}

export interface TimerState {
  currentBlockIndex: number;
  currentRep: number;
  currentPhase: Phase;
  timeLeft: number;
  isActive: boolean;
  isFinished: boolean;
  totalTimeInPhase: number;
}
