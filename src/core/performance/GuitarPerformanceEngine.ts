import type {
  GuitarPerformanceSettings,
  GuitarPerformanceSnapshot,
  GuitarTransition,
  LiveMidiMessage,
  PerformanceEvent,
  PerformanceProfile,
} from './LivePerformanceTypes';

const DEFAULT_SETTINGS: GuitarPerformanceSettings = {
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
};

interface HeldNoteState {
  note: number;
  velocity: number;
  order: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function normalizedPitchBend(message: LiveMidiMessage): number {
  if (typeof message.normalizedValue === 'number') {
    return Math.max(-1, Math.min(1, message.normalizedValue));
  }
  const raw = message.value ?? 8192;
  return Math.max(-1, Math.min(1, (raw - 8192) / 8192));
}

function normalizedControllerValue(message: LiveMidiMessage): number {
  if (typeof message.normalizedValue === 'number') {
    return clamp01(message.normalizedValue);
  }
  return clamp01((message.value ?? 0) / 127);
}

/**
 * Vendor-neutral guitar performance interpreter.
 *
 * Raw MIDI is converted into semantic events that can later be consumed by
 * SFZ, Kontakt, VST3, an external DAW, or K.G.Studio's current sampler.
 */
export class GuitarPerformanceEngine {
  private readonly profile: PerformanceProfile;
  private settings: GuitarPerformanceSettings;
  private heldNotes = new Map<number, HeldNoteState>();
  private activeNote: number | null = null;
  private sequence = 0;
  private bendSemitones = 0;
  private vibratoTarget = 0;
  private vibratoSmoothed = 0;
  private lastVibratoTimestampMs: number | null = null;
  private expression = 1;
  private sustain = false;
  private activeArticulationId = 'sustain';
  private lastTransition: GuitarTransition | null = null;

  constructor(profile: PerformanceProfile, settingsOverride: Partial<GuitarPerformanceSettings> = {}) {
    this.profile = profile;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(profile.guitar ?? {}),
      ...settingsOverride,
    };
  }

  public getProfile(): PerformanceProfile {
    return this.profile;
  }

  public getSettings(): GuitarPerformanceSettings {
    return { ...this.settings };
  }

  public setSettings(settings: Partial<GuitarPerformanceSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  public reset(): void {
    this.heldNotes.clear();
    this.activeNote = null;
    this.sequence = 0;
    this.bendSemitones = 0;
    this.vibratoTarget = 0;
    this.vibratoSmoothed = 0;
    this.lastVibratoTimestampMs = null;
    this.expression = 1;
    this.sustain = false;
    this.activeArticulationId = 'sustain';
    this.lastTransition = null;
  }

  public process(message: LiveMidiMessage): PerformanceEvent[] {
    if (message.kind === 'note-on' && (message.velocity ?? 0) > 0) {
      const keyswitch = this.resolveKeyswitchArticulation(message.note ?? -1);
      if (keyswitch) {
        this.activeArticulationId = keyswitch;
        return [this.articulationEvent(message, keyswitch)];
      }
      return this.handleNoteOn(message);
    }

    if (message.kind === 'note-off' || (message.kind === 'note-on' && (message.velocity ?? 0) === 0)) {
      if (this.resolveKeyswitchArticulation(message.note ?? -1)) {
        return [];
      }
      return this.handleNoteOff(message);
    }

    if (message.kind === 'pitch-bend') {
      const normalized = normalizedPitchBend(message);
      this.bendSemitones = normalized * this.settings.bendRangeSemitones;
      return [{
        kind: 'bend',
        timestampMs: message.timestampMs,
        channel: message.channel,
        value: this.bendSemitones,
        normalizedValue: normalized,
        bendSemitones: this.bendSemitones,
        sourceMessage: message,
      }];
    }

    if (message.kind === 'control-change') {
      return this.handleControlChange(message);
    }

    if (message.kind === 'channel-pressure' || message.kind === 'poly-aftertouch') {
      if (this.mappingTargetsVibrato(message.kind === 'channel-pressure' ? 'channel-aftertouch' : 'poly-aftertouch')) {
        return [this.buildVibratoEvent(message, normalizedControllerValue(message))];
      }
    }

    return [];
  }

  public isKeyswitchNote(note: number): boolean {
    return this.resolveKeyswitchArticulation(note) !== null;
  }

  public getSnapshot(): GuitarPerformanceSnapshot {
    return {
      profileId: this.profile.id,
      mode: this.settings.mode,
      activeNote: this.activeNote,
      heldNotes: [...this.heldNotes.values()]
        .sort((left, right) => left.order - right.order)
        .map(entry => entry.note),
      bendSemitones: this.bendSemitones,
      vibrato: this.vibratoSmoothed,
      expression: this.expression,
      sustain: this.sustain,
      activeArticulationId: this.activeArticulationId,
      lastTransition: this.lastTransition,
    };
  }

  private handleNoteOn(message: LiveMidiMessage): PerformanceEvent[] {
    const note = message.note;
    if (note === undefined) return [];

    const velocity = Math.max(1, Math.min(127, message.velocity ?? 127));
    this.sequence += 1;
    this.heldNotes.set(note, { note, velocity, order: this.sequence });

    if (this.settings.mode === 'poly') {
      this.activeNote = note;
      this.lastTransition = 'pick';
      return [this.noteStartEvent(message, note, velocity, 'pick', true)];
    }

    if (this.activeNote === null) {
      this.activeNote = note;
      this.lastTransition = 'pick';
      return [this.noteStartEvent(message, note, velocity, 'pick', true)];
    }

    if (this.activeNote === note) {
      this.lastTransition = 'pick';
      return [
        this.noteEndEvent(message, note),
        this.noteStartEvent(message, note, velocity, 'pick', true),
      ];
    }

    const previousNote = this.activeNote;
    const transition = this.resolveTransition(previousNote, note);
    this.activeNote = note;
    this.lastTransition = transition;
    this.activeArticulationId = transition;

    return [
      this.articulationEvent(message, transition),
      this.noteEndEvent(message, previousNote),
      this.noteStartEvent(
        message,
        note,
        velocity,
        transition,
        this.settings.retriggerPolicy === 'always',
      ),
    ];
  }

  private handleNoteOff(message: LiveMidiMessage): PerformanceEvent[] {
    const note = message.note;
    if (note === undefined) return [];

    this.heldNotes.delete(note);

    if (this.settings.mode === 'poly') {
      if (this.activeNote === note) {
        this.activeNote = this.getLastHeldNote()?.note ?? null;
      }
      return [this.noteEndEvent(message, note)];
    }

    if (this.activeNote !== note) {
      return [];
    }

    const fallback = this.getLastHeldNote();
    if (!fallback) {
      this.activeNote = null;
      this.lastTransition = null;
      return [this.noteEndEvent(message, note)];
    }

    const transition = this.resolveTransition(note, fallback.note);
    this.activeNote = fallback.note;
    this.lastTransition = transition;
    this.activeArticulationId = transition;

    return [
      this.articulationEvent(message, transition),
      this.noteEndEvent(message, note),
      this.noteStartEvent(
        message,
        fallback.note,
        fallback.velocity,
        transition,
        this.settings.retriggerPolicy === 'always',
      ),
    ];
  }

  private handleControlChange(message: LiveMidiMessage): PerformanceEvent[] {
    const controller = message.controller;
    if (controller === undefined) return [];

    const normalized = normalizedControllerValue(message);

    if (this.mappingTargets(controller, 'guitar.vibrato')) {
      return [this.buildVibratoEvent(message, normalized)];
    }

    if (this.mappingTargets(controller, 'guitar.expression')) {
      this.expression = normalized;
      return [{
        kind: 'expression',
        timestampMs: message.timestampMs,
        channel: message.channel,
        value: normalized,
        normalizedValue: normalized,
        sourceMessage: message,
      }];
    }

    if (this.mappingTargets(controller, 'guitar.sustain')) {
      this.sustain = normalized >= 0.5;
      return [{
        kind: 'sustain',
        timestampMs: message.timestampMs,
        channel: message.channel,
        value: this.sustain ? 1 : 0,
        normalizedValue: this.sustain ? 1 : 0,
        sourceMessage: message,
      }];
    }

    const articulation = this.resolveControllerArticulation(controller, message.value ?? 0);
    if (articulation) {
      this.activeArticulationId = articulation;
      return [this.articulationEvent(message, articulation)];
    }

    return [];
  }

  private buildVibratoEvent(message: LiveMidiMessage, target: number): PerformanceEvent {
    this.vibratoTarget = clamp01(target);

    if (this.lastVibratoTimestampMs === null || this.settings.vibratoSmoothingMs <= 0) {
      this.vibratoSmoothed = this.vibratoTarget;
    } else {
      const dt = Math.max(0, message.timestampMs - this.lastVibratoTimestampMs);
      const alpha = 1 - Math.exp(-dt / Math.max(1, this.settings.vibratoSmoothingMs));
      this.vibratoSmoothed += (this.vibratoTarget - this.vibratoSmoothed) * alpha;
    }

    this.lastVibratoTimestampMs = message.timestampMs;

    return {
      kind: 'vibrato',
      timestampMs: message.timestampMs,
      channel: message.channel,
      value: this.vibratoSmoothed,
      normalizedValue: this.vibratoSmoothed,
      sourceMessage: message,
    };
  }

  private resolveTransition(fromNote: number, toNote: number): GuitarTransition {
    if (!this.settings.legatoEnabled) {
      return 'pick';
    }

    const interval = toNote - fromNote;
    const distance = Math.abs(interval);
    const hammerPullLimit = this.settings.hammerPullMaxIntervalSemitones ?? 2;
    const slideLimit = this.settings.slideMaxIntervalSemitones ?? 7;

    if (this.settings.hammerPullDetectionEnabled && distance > 0 && distance <= hammerPullLimit) {
      return interval > 0 ? 'hammer-on' : 'pull-off';
    }

    if (this.settings.slideDetectionEnabled && distance > 0 && distance <= slideLimit) {
      return interval > 0 ? 'slide-up' : 'slide-down';
    }

    return 'legato';
  }

  private getLastHeldNote(): HeldNoteState | null {
    let latest: HeldNoteState | null = null;
    for (const entry of this.heldNotes.values()) {
      if (!latest || entry.order > latest.order) {
        latest = entry;
      }
    }
    return latest;
  }

  private noteStartEvent(
    message: LiveMidiMessage,
    note: number,
    velocity: number,
    transition: GuitarTransition,
    retrigger: boolean,
  ): PerformanceEvent {
    return {
      kind: 'note-start',
      timestampMs: message.timestampMs,
      channel: message.channel,
      note,
      velocity,
      transition,
      retrigger,
      articulationId: this.activeArticulationId,
      sourceMessage: message,
    };
  }

  private noteEndEvent(message: LiveMidiMessage, note: number): PerformanceEvent {
    return {
      kind: 'note-end',
      timestampMs: message.timestampMs,
      channel: message.channel,
      note,
      sourceMessage: message,
    };
  }

  private articulationEvent(message: LiveMidiMessage, articulationId: string): PerformanceEvent {
    return {
      kind: 'articulation',
      timestampMs: message.timestampMs,
      channel: message.channel,
      articulationId,
      sourceMessage: message,
    };
  }

  private mappingTargets(controller: number, target: string): boolean {
    return this.profile.mappings.some(mapping => (
      mapping.target === target
      && (
        (mapping.source === 'cc' && mapping.cc === controller)
        || (mapping.source === 'mod-wheel' && controller === 1)
        || (mapping.source === 'expression' && controller === 11)
        || (mapping.source === 'sustain-pedal' && controller === 64)
      )
    ));
  }

  private mappingTargetsVibrato(source: 'channel-aftertouch' | 'poly-aftertouch'): boolean {
    return this.profile.mappings.some(mapping => mapping.source === source && mapping.target === 'guitar.vibrato');
  }

  private resolveKeyswitchArticulation(note: number): string | null {
    const mapping = this.profile.mappings.find(candidate => (
      candidate.source === 'keyswitch'
      && candidate.target === 'guitar.articulation'
      && candidate.keyswitchNote === note
    ));
    if (!mapping) return null;

    const definition = this.profile.articulations.find(candidate => (
      candidate.trigger.type === 'keyswitch' && candidate.trigger.note === note
    ));
    return definition?.id ?? null;
  }

  private resolveControllerArticulation(controller: number, value: number): string | null {
    const definition = this.profile.articulations.find(candidate => (
      candidate.trigger.type === 'cc'
      && candidate.trigger.cc === controller
      && value >= candidate.trigger.min
      && value <= candidate.trigger.max
    ));
    return definition?.id ?? null;
  }
}
