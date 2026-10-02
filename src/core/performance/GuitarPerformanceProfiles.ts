import type { PerformanceProfile } from './LivePerformanceTypes';

export const GUITAR_PERFORMANCE_PROFILES: PerformanceProfile[] = [
  {
    id: 'guitar.lead.standard',
    name: 'Guitar Lead — Standard',
    instrumentFamily: 'guitar',
    mappings: [
      { id: 'bend', source: 'pitch-wheel', target: 'guitar.bend', min: -1, max: 1 },
      { id: 'vibrato-mod', source: 'mod-wheel', target: 'guitar.vibrato', min: 0, max: 1 },
      { id: 'expression', source: 'expression', target: 'guitar.expression', min: 0, max: 1 },
      { id: 'sustain', source: 'sustain-pedal', target: 'guitar.sustain', min: 0, max: 1 },
      { id: 'ks-sustain', source: 'keyswitch', target: 'guitar.articulation', keyswitchNote: 24 },
      { id: 'ks-palm', source: 'keyswitch', target: 'guitar.articulation', keyswitchNote: 25 },
      { id: 'ks-harmonic', source: 'keyswitch', target: 'guitar.articulation', keyswitchNote: 26 },
    ],
    articulations: [
      { id: 'sustain', name: 'Sustain', trigger: { type: 'keyswitch', note: 24 }, mutuallyExclusiveGroup: 'guitar-main', latch: true },
      { id: 'palm-mute', name: 'Palm Mute', trigger: { type: 'keyswitch', note: 25 }, mutuallyExclusiveGroup: 'guitar-main', latch: true },
      { id: 'harmonic', name: 'Harmonic', trigger: { type: 'keyswitch', note: 26 }, mutuallyExclusiveGroup: 'guitar-main', latch: true },
    ],
    guitar: {
      mode: 'mono-lead',
      bendRangeSemitones: 2,
      legatoEnabled: true,
      slideDetectionEnabled: true,
      hammerPullDetectionEnabled: true,
      vibratoSmoothingMs: 45,
      vibratoMaxSemitones: 0.35,
      vibratoRateHz: 5.5,
      hammerPullMaxIntervalSemitones: 2,
      slideMaxIntervalSemitones: 7,
      retriggerPolicy: 'legato-aware',
      preserveHumanTiming: true,
    },
  },
  {
    id: 'guitar.lead.expressive',
    name: 'Guitar Lead — Expressive',
    instrumentFamily: 'guitar',
    mappings: [
      { id: 'bend', source: 'pitch-wheel', target: 'guitar.bend', min: -1, max: 1 },
      { id: 'vibrato-mod', source: 'mod-wheel', target: 'guitar.vibrato', min: 0, max: 1 },
      { id: 'vibrato-pressure', source: 'channel-aftertouch', target: 'guitar.vibrato', min: 0, max: 1 },
      { id: 'expression', source: 'expression', target: 'guitar.expression', min: 0, max: 1 },
      { id: 'sustain', source: 'sustain-pedal', target: 'guitar.sustain', min: 0, max: 1 },
    ],
    articulations: [],
    guitar: {
      mode: 'mono-lead',
      bendRangeSemitones: 2,
      legatoEnabled: true,
      slideDetectionEnabled: true,
      hammerPullDetectionEnabled: true,
      vibratoSmoothingMs: 70,
      vibratoMaxSemitones: 0.45,
      vibratoRateHz: 5.2,
      hammerPullMaxIntervalSemitones: 2,
      slideMaxIntervalSemitones: 9,
      retriggerPolicy: 'legato-aware',
      preserveHumanTiming: true,
    },
  },
  {
    id: 'guitar.lead.wide-bend',
    name: 'Guitar Lead — Wide Bend',
    instrumentFamily: 'guitar',
    mappings: [
      { id: 'bend', source: 'pitch-wheel', target: 'guitar.bend', min: -1, max: 1 },
      { id: 'vibrato-mod', source: 'mod-wheel', target: 'guitar.vibrato', min: 0, max: 1 },
      { id: 'expression', source: 'expression', target: 'guitar.expression', min: 0, max: 1 },
      { id: 'sustain', source: 'sustain-pedal', target: 'guitar.sustain', min: 0, max: 1 },
    ],
    articulations: [],
    guitar: {
      mode: 'mono-lead',
      bendRangeSemitones: 4,
      legatoEnabled: true,
      slideDetectionEnabled: true,
      hammerPullDetectionEnabled: true,
      vibratoSmoothingMs: 55,
      vibratoMaxSemitones: 0.4,
      vibratoRateHz: 5.5,
      hammerPullMaxIntervalSemitones: 2,
      slideMaxIntervalSemitones: 12,
      retriggerPolicy: 'legato-aware',
      preserveHumanTiming: true,
    },
  },
];

export function getGuitarPerformanceProfile(profileId: string): PerformanceProfile | null {
  return GUITAR_PERFORMANCE_PROFILES.find(profile => profile.id === profileId) ?? null;
}
