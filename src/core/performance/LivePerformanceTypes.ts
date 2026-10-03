/**
 * Domain contracts for live MIDI performance.
 *
 * These types intentionally avoid dependencies on React, Web MIDI, VST3,
 * Kontakt, FL Studio or any specific plugin vendor.
 */

export type MidiMessageKind =
  | "note-on"
  | "note-off"
  | "pitch-bend"
  | "control-change"
  | "channel-pressure"
  | "poly-aftertouch"
  | "program-change"
  | "unknown";

export interface LiveMidiMessage {
  kind: MidiMessageKind;
  deviceId: string;
  channel: number;
  timestampMs: number;
  data1?: number;
  data2?: number;
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
  normalizedValue?: number;
}

export type PerformanceEventKind =
  | "note-start"
  | "note-end"
  | "bend"
  | "vibrato"
  | "expression"
  | "sustain"
  | "pressure"
  | "articulation"
  | "parameter";

export type GuitarTransition =
  | "pick"
  | "legato"
  | "hammer-on"
  | "pull-off"
  | "slide-up"
  | "slide-down";

export interface PerformanceEvent {
  kind: PerformanceEventKind;
  timestampMs: number;
  channel: number;
  note?: number;
  velocity?: number;
  value?: number;
  articulationId?: string;
  parameterId?: string;
  normalizedValue?: number;
  bendSemitones?: number;
  transition?: GuitarTransition;
  retrigger?: boolean;
  pressureKind?: "channel" | "poly";
  sourceMessage?: LiveMidiMessage;
}

export type MidiControlSource =
  | "pitch-wheel"
  | "mod-wheel"
  | "channel-aftertouch"
  | "poly-aftertouch"
  | "sustain-pedal"
  | "expression"
  | "cc"
  | "keyswitch";

export type PerformanceTarget =
  | "guitar.bend"
  | "guitar.vibrato"
  | "guitar.expression"
  | "guitar.sustain"
  | "guitar.articulation"
  | "instrument.parameter"
  | "effect.parameter";

export interface MidiControlMapping {
  id: string;
  source: MidiControlSource;
  target: PerformanceTarget;
  cc?: number;
  keyswitchNote?: number;
  min?: number;
  max?: number;
  curve?: "linear" | "soft" | "hard";
  invert?: boolean;
  parameterId?: string;
}

export interface ArticulationDefinition {
  id: string;
  name: string;
  trigger:
    | { type: "keyswitch"; note: number }
    | { type: "cc"; cc: number; min: number; max: number }
    | { type: "semantic"; action: string };
  mutuallyExclusiveGroup?: string;
  latch?: boolean;
}

export interface GuitarPerformanceSettings {
  mode: "mono-lead" | "poly";
  bendRangeSemitones: number;
  legatoEnabled: boolean;
  slideDetectionEnabled: boolean;
  hammerPullDetectionEnabled: boolean;
  vibratoSmoothingMs: number;
  vibratoMaxSemitones?: number;
  vibratoRateHz?: number;
  hammerPullMaxIntervalSemitones?: number;
  slideMaxIntervalSemitones?: number;
  retriggerPolicy: "always" | "legato-aware" | "backend";
  preserveHumanTiming: boolean;
}

export interface PerformanceProfile {
  id: string;
  name: string;
  instrumentFamily: "guitar" | "bass" | "piano" | "strings" | "brass" | "synth" | "generic";
  mappings: MidiControlMapping[];
  articulations: ArticulationDefinition[];
  guitar?: GuitarPerformanceSettings;
}

export type SignalChainBlockType =
  | "compressor"
  | "boost"
  | "overdrive"
  | "fuzz"
  | "distortion"
  | "amp"
  | "cabinet"
  | "eq"
  | "modulation"
  | "delay"
  | "reverb"
  | "volume"
  | "custom";

export interface SignalChainBlock {
  id: string;
  type: SignalChainBlockType;
  name: string;
  enabled: boolean;
  pluginId?: string;
  parameters: Record<string, number | string | boolean>;
}

export type InstrumentBackendKind =
  | "soundfont"
  | "sfz"
  | "external-daw"
  | "vst3"
  | "native"
  | "unknown";

export interface InstrumentAdapterDescriptor {
  id: string;
  name: string;
  backend: InstrumentBackendKind;
  supportsPitchBend: boolean;
  supportsAftertouch: boolean;
  supportsArticulations: boolean;
  supportsParameterAutomation: boolean;
  supportsStatePersistence: boolean;
  supportsTrueLegato?: boolean;
  supportsSemanticTransitions?: boolean;
  availability?: "ready" | "needs-configuration" | "unavailable";
  latencyMode?: "in-process" | "external-midi" | "plugin-host";
  metadata?: Record<string, string>;
}

export interface PerformancePreset {
  id: string;
  name: string;
  version: number;
  category: string;
  description?: string;
  instrumentProfileId: string;
  mappings: MidiControlMapping[];
  articulationIds: string[];
  signalChain: SignalChainBlock[];
  backendRequirements?: {
    preferredBackends?: InstrumentBackendKind[];
    requiredCapabilities?: Array<
      | "pitch-bend"
      | "aftertouch"
      | "articulations"
      | "automation"
      | "state-persistence"
    >;
  };
  metadata?: Record<string, string | number | boolean>;
}

export interface LivePerformanceState {
  enabled: boolean;
  armed: boolean;
  monitoring: boolean;
  selectedDeviceId?: string;
  midiChannel?: number;
  profileId?: string;
  presetId?: string;
  adapterId?: string;
  measuredInputLatencyMs?: number;
  activeArticulationId?: string;
  lastMessage?: LiveMidiMessage;
}

export interface RecordedPerformanceLane {
  type:
    | "notes"
    | "pitch-bend"
    | "cc"
    | "aftertouch"
    | "sustain"
    | "articulation"
    | "parameter";
  controller?: number;
  parameterId?: string;
}

export interface RetrospectiveMidiBufferConfig {
  enabled: boolean;
  durationSeconds: number;
  includeSystemRealtimeMessages?: boolean;
}


export interface GuitarPerformanceSnapshot {
  profileId: string;
  mode: "mono-lead" | "poly";
  activeNote: number | null;
  heldNotes: number[];
  bendSemitones: number;
  vibrato: number;
  expression: number;
  sustain: boolean;
  activeArticulationId: string;
  lastTransition: GuitarTransition | null;
}
