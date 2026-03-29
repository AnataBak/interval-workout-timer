/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Settings2,
  Timer as TimerIcon,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Minus,
  Check,
  SkipForward
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TimerBlock, TimerState, Phase, WorkoutPreset } from './types';

const INITIAL_BLOCK = (): TimerBlock => ({
  id: crypto.randomUUID(),
  name: 'Блок',
  workTime: 30,
  restTime: 10,
  reps: 3,
});

const STORAGE_KEY = 'interval_timer_presets';

export default function App() {
  // --- State ---
  const [blocks, setBlocks] = useState<TimerBlock[]>(() => [
    {
      id: crypto.randomUUID(),
      name: 'Блок 1',
      workTime: 30,
      restTime: 10,
      reps: 3,
    }
  ]);
  const [transitionTime, setTransitionTime] = useState(15);
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  
  const [state, setState] = useState<TimerState>(() => {
    const initialWorkTime = 30;
    return {
      currentBlockIndex: 0,
      currentRep: 1,
      currentPhase: 'WORK',
      timeLeft: initialWorkTime,
      isActive: false,
      isFinished: false,
      totalTimeInPhase: initialWorkTime,
    };
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // --- Initialization ---
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setPresets(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load presets', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  }, [presets]);

  // --- Audio ---
  const playBeep = useCallback((type: 'WORK' | 'REST' | 'TRANSITION' | 'FINISH') => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      
      const playTone = (freq: number, start: number, duration: number, volume = 0.1) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };

      const now = ctx.currentTime;
      switch (type) {
        case 'WORK':
          playTone(880, now, 0.5); // High beep
          break;
        case 'REST':
          playTone(440, now, 0.5); // Low beep
          break;
        case 'TRANSITION':
          playTone(660, now, 0.2); // Mid beep
          playTone(660, now + 0.25, 0.2); // Double mid beep
          break;
        case 'FINISH':
          playTone(440, now, 0.2);
          playTone(660, now + 0.2, 0.2);
          playTone(880, now + 0.4, 0.6); // Ascending fanfare
          break;
      }
    } catch (e) {
      console.error('Audio error:', e);
    }
  }, []);

  // --- Timer Logic ---
  const nextPhase = useCallback(() => {
    setState(prev => {
      const currentBlock = blocks[prev.currentBlockIndex];
      
      // If we were working
      if (prev.currentPhase === 'WORK') {
        if (prev.currentRep < currentBlock.reps) {
          playBeep('REST');
          return { 
            ...prev, 
            currentPhase: 'REST', 
            timeLeft: currentBlock.restTime,
            totalTimeInPhase: currentBlock.restTime 
          };
        } else {
          if (prev.currentBlockIndex < blocks.length - 1) {
            playBeep('TRANSITION');
            return { 
              ...prev, 
              currentPhase: 'TRANSITION', 
              timeLeft: transitionTime,
              totalTimeInPhase: transitionTime 
            };
          } else {
            playBeep('FINISH');
            return { ...prev, isActive: false, isFinished: true };
          }
        }
      }

      // If we were resting
      if (prev.currentPhase === 'REST') {
        playBeep('WORK');
        return { 
          ...prev, 
          currentPhase: 'WORK', 
          currentRep: prev.currentRep + 1, 
          timeLeft: currentBlock.workTime,
          totalTimeInPhase: currentBlock.workTime 
        };
      }

      // If we were in transition
      if (prev.currentPhase === 'TRANSITION') {
        playBeep('WORK');
        const nextBlock = blocks[prev.currentBlockIndex + 1];
        return { 
          ...prev, 
          currentBlockIndex: prev.currentBlockIndex + 1, 
          currentRep: 1, 
          currentPhase: 'WORK', 
          timeLeft: nextBlock.workTime,
          totalTimeInPhase: nextBlock.workTime 
        };
      }

      return prev;
    });
  }, [blocks, transitionTime, playBeep]);

  useEffect(() => {
    if (state.isActive && state.timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setState(prev => {
          if (prev.timeLeft <= 1) {
            clearInterval(timerRef.current!);
            return { ...prev, timeLeft: 0 };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    } else if (state.isActive && state.timeLeft === 0) {
      nextPhase();
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state.isActive, state.timeLeft, nextPhase]);

  // Sync timer with block changes when not active
  useEffect(() => {
    if (!state.isActive && !state.isFinished) {
      const currentBlock = blocks[state.currentBlockIndex];
      if (!currentBlock) return;

      let targetTime = 0;
      if (state.currentPhase === 'WORK') targetTime = currentBlock.workTime;
      else if (state.currentPhase === 'REST') targetTime = currentBlock.restTime;
      else if (state.currentPhase === 'TRANSITION') targetTime = transitionTime;

      // Only update if the total time for this phase was changed in settings
      if (state.totalTimeInPhase !== targetTime) {
        // If we haven't started the phase yet (or it's a fresh reset), update timeLeft too
        const hasNotStarted = state.timeLeft === state.totalTimeInPhase;
        setState(prev => ({
          ...prev,
          timeLeft: hasNotStarted ? targetTime : prev.timeLeft,
          totalTimeInPhase: targetTime
        }));
      }
    }
  }, [blocks, transitionTime, state.isActive, state.isFinished, state.currentBlockIndex, state.currentPhase, state.totalTimeInPhase, state.timeLeft]);

  // --- Calculations ---
  const totalWorkoutTime = useMemo(() => {
    let total = 0;
    blocks.forEach((block, idx) => {
      total += (block.workTime * block.reps);
      total += (block.restTime * (block.reps - 1));
      if (idx < blocks.length - 1) {
        total += transitionTime;
      }
    });
    return total;
  }, [blocks, transitionTime]);

  const elapsedWorkoutTime = useMemo(() => {
    let elapsed = 0;
    // Time from previous blocks
    for (let i = 0; i < state.currentBlockIndex; i++) {
      const b = blocks[i];
      elapsed += (b.workTime * b.reps) + (b.restTime * (b.reps - 1)) + transitionTime;
    }
    // Time from previous reps in current block
    const currentBlock = blocks[state.currentBlockIndex];
    for (let r = 1; r < state.currentRep; r++) {
      elapsed += currentBlock.workTime + currentBlock.restTime;
    }
    // Time in current phase
    if (state.currentPhase === 'WORK') {
      elapsed += (state.totalTimeInPhase - state.timeLeft);
    } else if (state.currentPhase === 'REST') {
      elapsed += currentBlock.workTime + (state.totalTimeInPhase - state.timeLeft);
    } else if (state.currentPhase === 'TRANSITION') {
      // We are at the end of the current block
      elapsed += (currentBlock.workTime * currentBlock.reps) + (currentBlock.restTime * (currentBlock.reps - 1)) + (state.totalTimeInPhase - state.timeLeft);
    }
    return elapsed;
  }, [blocks, transitionTime, state]);

  const overallProgress = useMemo(() => {
    if (totalWorkoutTime === 0) return 0;
    return (elapsedWorkoutTime / totalWorkoutTime) * 100;
  }, [elapsedWorkoutTime, totalWorkoutTime]);

  // --- Actions ---
  const toggleTimer = () => {
    if (state.isFinished) {
      resetTimer();
    } else {
      if (!state.isActive) {
        playBeep('WORK');
      }
      setState(prev => ({ ...prev, isActive: !prev.isActive }));
    }
  };

  const resetTimer = () => {
    setState({
      currentBlockIndex: 0,
      currentRep: 1,
      currentPhase: 'WORK',
      timeLeft: blocks[0].workTime,
      isActive: false,
      isFinished: false,
      totalTimeInPhase: blocks[0].workTime,
    });
  };

  const addBlock = () => {
    const newBlock = INITIAL_BLOCK();
    setBlocks(prev => [...prev, newBlock]);
  };

  const removeBlock = (id: string) => {
    if (blocks.length > 1) {
      setBlocks(prev => prev.filter(b => b.id !== id));
    }
  };

  const updateBlock = (id: string, updates: Partial<TimerBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const savePreset = () => {
    setNewPresetName(`Тренировка ${presets.length + 1}`);
    setShowSaveModal(true);
  };

  const handleSavePreset = () => {
    if (newPresetName.trim()) {
      const newPreset: WorkoutPreset = {
        id: crypto.randomUUID(),
        name: newPresetName.trim(),
        blocks,
        transitionTime
      };
      setPresets(prev => [...prev, newPreset]);
      setShowSaveModal(false);
      setNewPresetName('');
    }
  };

  const loadPreset = (preset: WorkoutPreset) => {
    setBlocks(preset.blocks);
    setTransitionTime(preset.transitionTime);
    setShowPresets(false);
    // Reset state to match new preset
    setState({
      currentBlockIndex: 0,
      currentRep: 1,
      currentPhase: 'WORK',
      timeLeft: preset.blocks[0].workTime,
      isActive: false,
      isFinished: false,
      totalTimeInPhase: preset.blocks[0].workTime,
    });
  };

  const deletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPresets(prev => prev.filter(p => p.id !== id));
  };

  // --- UI Helpers ---
  const progress = useMemo(() => {
    if (state.totalTimeInPhase === 0) return 0;
    return (state.timeLeft / state.totalTimeInPhase) * 100;
  }, [state.timeLeft, state.totalTimeInPhase]);

  // Color interpolation: 0% (red) to 100% (green)
  // We want to show progress as "filling up" or "emptying"?
  // User said: "0 это красный 100 это зеленый"
  // Usually progress ring fills as time goes. Let's make it 100% at start (green) and 0% at end (red).
  const getProgressColor = (p: number) => {
    const r = Math.floor(255 * (1 - p / 100));
    const g = Math.floor(255 * (p / 100));
    return `rgb(${r}, ${g}, 0)`;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseLabel = (phase: Phase) => {
    switch (phase) {
      case 'WORK': return 'РАБОТА';
      case 'REST': return 'ОТДЫХ';
      case 'TRANSITION': return 'ПЕРЕРЫВ';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden">
      {/* Presets Slide-down */}
      <AnimatePresence>
        {showPresets && (
          <motion.div 
            initial={{ y: '-100%' }}
            animate={{ y: 0 }}
            exit={{ y: '-100%' }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xl p-8 overflow-y-auto"
          >
            <div className="max-w-md mx-auto">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold italic uppercase tracking-tighter">Пресеты</h2>
                <button onClick={() => setShowPresets(false)} className="p-2 bg-white/10 rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                {presets.length === 0 && (
                  <p className="text-white/30 text-center py-12">Нет сохраненных пресетов</p>
                )}
                {presets.map(p => (
                  <div 
                    key={p.id} 
                    onClick={() => loadPreset(p)}
                    className="bg-white/5 border border-white/10 p-5 rounded-3xl flex items-center justify-between group cursor-pointer hover:bg-white/10 transition-colors"
                  >
                    <div>
                      <h3 className="font-bold text-lg">{p.name}</h3>
                      <p className="text-xs text-white/40">{p.blocks.length} блоков • {p.blocks.reduce((acc, b) => acc + b.reps, 0)} повторов</p>
                    </div>
                    <button 
                      onClick={(e) => deletePreset(p.id, e)}
                      className="p-2 text-white/20 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Preset Modal */}
      <AnimatePresence>
        {showSaveModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border border-white/10 p-8 rounded-[40px] w-full max-w-sm shadow-2xl"
            >
              <h3 className="text-xl font-bold italic uppercase tracking-tight mb-6">Сохранить пресет</h3>
              <input 
                autoFocus
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="Название тренировки"
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 mb-8 focus:outline-none focus:ring-2 focus:ring-white/20 transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleSavePreset()}
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 py-4 rounded-2xl bg-white/5 font-bold text-sm tracking-widest uppercase text-white/40 hover:bg-white/10 transition-colors"
                >
                  Отмена
                </button>
                <button 
                  onClick={handleSavePreset}
                  className="flex-1 py-4 rounded-2xl bg-white text-black font-bold text-sm tracking-widest uppercase hover:bg-white/90 transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-md mx-auto px-6 py-8 flex flex-col min-h-screen">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => setShowPresets(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 text-xs font-bold tracking-widest uppercase"
          >
            <Settings2 className="w-4 h-4" /> Пресеты
          </button>
          <button 
            onClick={savePreset}
            className="p-2 bg-white/5 rounded-full border border-white/10"
          >
            <Save className="w-5 h-5" />
          </button>
        </div>

        {/* Circular Timer Section */}
        <div className="flex flex-col items-center justify-center py-8">
          <div className="relative w-80 h-80 flex items-center justify-center">
            {/* Background Rings */}
            <svg className="absolute inset-0 w-full h-full -rotate-90">
              {/* Outer Ring Background (Phase Progress) */}
              <circle 
                cx="160" cy="160" r="140" 
                fill="transparent" 
                stroke="rgba(255,255,255,0.03)" 
                strokeWidth="12" 
              />
              {/* Inner Ring Background (Overall Progress) */}
              <circle 
                cx="160" cy="160" r="124" 
                fill="transparent" 
                stroke="rgba(255,255,255,0.02)" 
                strokeWidth="6" 
              />
              
              {/* Overall Progress Ring (Inner, Thinner) */}
              <motion.circle 
                cx="160" cy="160" r="124" 
                fill="transparent" 
                stroke={getProgressColor(overallProgress)}
                strokeWidth="6" 
                strokeDasharray={2 * Math.PI * 124}
                animate={{ strokeDashoffset: (2 * Math.PI * 124) * (1 - overallProgress / 100) }}
                strokeLinecap="round"
                transition={{ duration: 1, ease: "linear" }}
              />

              {/* Phase Progress Ring (Outer, Thicker) */}
              <motion.circle 
                cx="160" cy="160" r="140" 
                fill="transparent" 
                stroke={getProgressColor(progress)}
                strokeWidth="12" 
                strokeDasharray={2 * Math.PI * 140}
                animate={{ strokeDashoffset: (2 * Math.PI * 140) * (1 - progress / 100) }}
                strokeLinecap="round"
                transition={{ duration: 1, ease: "linear" }}
              />
            </svg>

            <div className="text-center z-10 flex flex-col items-center">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={state.currentPhase}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="text-[10px] font-black tracking-[0.5em] text-white/30 mb-1 uppercase"
                >
                  {getPhaseLabel(state.currentPhase)}
                </motion.div>
              </AnimatePresence>
              
              <div className="text-8xl font-mono font-extralight tabular-nums leading-none tracking-tighter">
                {formatTime(state.timeLeft)}
              </div>

              <div className="mt-4 flex flex-col items-center gap-1">
                <div className="flex items-center gap-3 text-white/60">
                  <span className="text-sm font-mono font-medium">{formatTime(totalWorkoutTime)}</span>
                  <span className="w-px h-3 bg-white/10" />
                  <span className="text-sm font-mono font-medium tabular-nums">{Math.round(overallProgress)}%</span>
                </div>
                
                <div className="mt-2 px-4 py-1 rounded-full bg-white/5 border border-white/5 flex items-center gap-2 text-[10px] font-bold text-white/20 uppercase tracking-widest">
                  <span>{state.currentRep}/{blocks[state.currentBlockIndex].reps}</span>
                  <span className="opacity-30">•</span>
                  <span>Блок {state.currentBlockIndex + 1}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-8 mb-16">
          <button 
            onClick={resetTimer}
            className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 active:scale-90 transition-transform"
          >
            <RotateCcw className="w-6 h-6" />
          </button>
          <button 
            onClick={toggleTimer}
            className={`w-24 h-24 rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-all ${
              state.isActive ? 'bg-white text-black' : 'bg-green-500 text-black'
            }`}
          >
            {state.isActive ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-1" />}
          </button>
          <button 
            onClick={nextPhase}
            className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex flex-col items-center justify-center text-white/60 active:scale-90 transition-transform"
            title="Пропустить этап"
          >
            <SkipForward className="w-6 h-6" />
            <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter">Skip</span>
          </button>
        </div>

        {/* Block Configuration */}
        <div className="space-y-6 pb-24">
          <h2 className="text-[10px] font-black tracking-[0.3em] text-white/20 uppercase px-2">Настройка тренировки</h2>
          
          <div className="space-y-4">
            {blocks.map((block, idx) => (
              <React.Fragment key={block.id}>
                <div className="bg-white/5 border border-white/10 rounded-[32px] p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <input 
                      value={block.name}
                      onChange={(e) => updateBlock(block.id, { name: e.target.value })}
                      className="bg-transparent font-bold text-lg focus:outline-none w-full italic uppercase tracking-tight"
                    />
                    {blocks.length > 1 && (
                      <button onClick={() => removeBlock(block.id)} className="text-white/20 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <TimeInput 
                      label="РАБОТА" 
                      value={block.workTime} 
                      onChange={(val) => updateBlock(block.id, { workTime: val })} 
                      color="text-orange-500"
                    />
                    <TimeInput 
                      label="ПАУЗА" 
                      value={block.restTime} 
                      onChange={(val) => updateBlock(block.id, { restTime: val })} 
                      color="text-emerald-500"
                    />
                    <TimeInput 
                      label="ПОВТОРЫ" 
                      value={block.reps} 
                      onChange={(val) => updateBlock(block.id, { reps: val })} 
                      color="text-blue-500"
                      isReps
                    />
                  </div>
                </div>

                {/* Transition Pause between blocks */}
                {idx < blocks.length - 1 && (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="w-px h-4 bg-white/10" />
                    <div className="w-full bg-white/5 px-6 py-4 rounded-[32px] border border-white/10">
                      <TimeInput 
                        label="Пауза между блоками" 
                        value={transitionTime} 
                        onChange={(val) => setTransitionTime(val)} 
                        color="text-white/40"
                      />
                    </div>
                    <div className="w-px h-4 bg-white/10" />
                  </div>
                )}
              </React.Fragment>
            ))}

            <button 
              onClick={addBlock}
              className="w-full py-6 rounded-[32px] border-2 border-dashed border-white/10 flex items-center justify-center gap-3 text-white/30 hover:text-white hover:border-white/30 transition-all active:scale-95"
            >
              <Plus className="w-6 h-6" />
              <span className="font-bold text-sm tracking-widest uppercase">Добавить блок</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TimeInputProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  color: string;
  isReps?: boolean;
}

function TimeInput({ label, value, onChange, color, isReps }: TimeInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value.toString());

  const handleBlur = () => {
    const num = parseInt(tempValue) || 0;
    onChange(num);
    setIsEditing(false);
  };

  return (
    <div className="flex items-center justify-between group">
      <span className={`text-[10px] font-black tracking-widest uppercase ${color}`}>{label}</span>
      <div className="flex items-center gap-4">
        <button 
          onClick={() => onChange(Math.max(isReps ? 1 : 0, value - 1))}
          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all"
        >
          <Minus className="w-4 h-4" />
        </button>
        
        <div className="w-16 text-center">
          {isEditing ? (
            <input 
              autoFocus
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
              className="bg-white/10 w-full text-center rounded-lg py-1 font-mono text-lg outline-none ring-1 ring-white/20"
            />
          ) : (
            <span 
              onClick={() => { setIsEditing(true); setTempValue(value.toString()); }}
              className="text-2xl font-mono font-light cursor-pointer hover:text-white/80"
            >
              {value}{!isReps && 'с'}
            </span>
          )}
        </div>

        <button 
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 active:scale-90 transition-all"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
