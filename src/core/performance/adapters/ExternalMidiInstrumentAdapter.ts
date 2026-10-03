import type { PerformanceEvent } from '../LivePerformanceTypes';
import type {
  ExternalMidiAdapterOptions,
  InstrumentArticulationMidiMapping,
  InstrumentPerformanceAdapter,
} from './InstrumentPerformanceAdapter';

const clamp7 = (value: number): number => Math.max(0, Math.min(127, Math.round(value)));
const clamp14 = (value: number): number => Math.max(0, Math.min(16383, Math.round(value)));

export const DEFAULT_GUITAR_ARTICULATION_MIDI_MAP: Record<string, InstrumentArticulationMidiMapping> = {
  sustain: { type: 'keyswitch', note: 24, releaseMs: 12 },
  'palm-mute': { type: 'keyswitch', note: 25, releaseMs: 12 },
  harmonic: { type: 'keyswitch', note: 26, releaseMs: 12 },
};

/**
 * Sends LP3 semantic performance events to a real MIDI output.
 *
 * The output can be a physical port or a virtual MIDI cable feeding FL Studio,
 * Kontakt, sfizz VST3, another DAW, or any MIDI-capable external instrument.
 */
export class ExternalMidiInstrumentAdapter implements InstrumentPerformanceAdapter {
  public readonly descriptor = {
    id: 'external-midi',
    name: 'External MIDI / DAW',
    backend: 'external-daw' as const,
    supportsPitchBend: true,
    supportsAftertouch: true,
    supportsArticulations: true,
    supportsParameterAutomation: false,
    supportsStatePersistence: false,
    supportsTrueLegato: true,
    supportsSemanticTransitions: true,
    availability: 'needs-configuration' as const,
    latencyMode: 'external-midi' as const,
    metadata: {
      protocol: 'Web MIDI output',
      targets: 'FL Studio, Kontakt, sfizz VST3, external DAW/instrument',
    },
  };

  private output: MIDIOutput | null;
  private channel: number;
  private bendRangeSemitones: number;
  private articulationMap: Record<string, InstrumentArticulationMidiMapping>;
  private activeNotes = new Set<number>();
  private active = false;

  constructor(options: ExternalMidiAdapterOptions) {
    this.output = options.output;
    this.channel = this.normalizeChannel(options.channel);
    this.bendRangeSemitones = this.normalizeBendRange(options.bendRangeSemitones);
    this.articulationMap = { ...options.articulationMap };
  }

  public configure(options: Partial<ExternalMidiAdapterOptions>): void {
    if ('output' in options) this.output = options.output ?? null;
    if (options.channel !== undefined) this.channel = this.normalizeChannel(options.channel);
    if (options.bendRangeSemitones !== undefined) {
      this.bendRangeSemitones = this.normalizeBendRange(options.bendRangeSemitones);
    }
    if (options.articulationMap) {
      this.articulationMap = { ...options.articulationMap };
    }

    if (this.active && this.output) {
      this.sendPitchBendSensitivity();
    }
  }

  public getOutputId(): string | null {
    return this.output?.id ?? null;
  }

  public getChannel(): number {
    return this.channel;
  }

  public getBendRangeSemitones(): number {
    return this.bendRangeSemitones;
  }

  public isReady(): boolean {
    return this.output !== null && this.output.state !== 'disconnected';
  }

  public activate(): void {
    this.active = true;
    if (this.output) {
      this.sendPitchBendSensitivity();
      this.sendPitchBendNormalized(0);
      this.sendCc(1, 0);
      this.sendCc(11, 127);
      this.sendCc(64, 0);
    }
  }

  public deactivate(): void {
    this.panic();
    this.active = false;
  }

  public handleEvents(events: PerformanceEvent[]): void {
    if (!this.active || !this.output || events.length === 0) {
      return;
    }

    // For semantic legato/hammer/pull/slide transitions the new note must reach
    // a scripted external instrument before the previous note is released.
    const legatoStart = events.find(event => (
      event.kind === 'note-start'
      && event.note !== undefined
      && event.retrigger === false
    ));
    const transitionEnd = legatoStart
      ? events.find(event => event.kind === 'note-end' && event.note !== undefined)
      : undefined;

    const handled = new Set<PerformanceEvent>();

    for (const event of events) {
      if (event.kind === 'articulation') {
        this.sendArticulation(event.articulationId);
        handled.add(event);
      } else if (
        event.kind !== 'note-start'
        && event.kind !== 'note-end'
      ) {
        this.sendNonNoteEvent(event);
        handled.add(event);
      }
    }

    if (legatoStart && transitionEnd) {
      this.sendNoteOn(legatoStart.note!, legatoStart.velocity ?? 127);
      handled.add(legatoStart);
      this.sendNoteOff(transitionEnd.note!);
      handled.add(transitionEnd);
    }

    for (const event of events) {
      if (handled.has(event)) continue;
      if (event.kind === 'note-start' && event.note !== undefined) {
        this.sendNoteOn(event.note, event.velocity ?? 127);
      } else if (event.kind === 'note-end' && event.note !== undefined) {
        this.sendNoteOff(event.note);
      }
    }
  }

  public panic(): void {
    if (!this.output) {
      this.activeNotes.clear();
      return;
    }

    for (const note of this.activeNotes) {
      this.send([0x80 | this.channel, clamp7(note), 0]);
    }
    this.activeNotes.clear();

    this.sendCc(64, 0);
    this.sendCc(1, 0);
    this.sendCc(123, 0); // All Notes Off
    this.sendCc(120, 0); // All Sound Off
    this.sendPitchBendNormalized(0);
  }

  private sendNonNoteEvent(event: PerformanceEvent): void {
    if (event.kind === 'bend') {
      this.sendPitchBendNormalized(event.normalizedValue ?? 0);
    } else if (event.kind === 'vibrato') {
      this.sendCc(1, clamp7((event.normalizedValue ?? event.value ?? 0) * 127));
    } else if (event.kind === 'expression') {
      this.sendCc(11, clamp7((event.normalizedValue ?? event.value ?? 1) * 127));
    } else if (event.kind === 'sustain') {
      this.sendCc(64, (event.value ?? 0) >= 0.5 ? 127 : 0);
    }
  }

  private sendArticulation(articulationId?: string): void {
    if (!articulationId) return;
    const mapping = this.articulationMap[articulationId];
    if (!mapping) return;

    if (mapping.type === 'cc' && mapping.controller !== undefined) {
      this.sendCc(mapping.controller, mapping.value ?? 127);
      return;
    }

    if (mapping.type === 'keyswitch' && mapping.note !== undefined) {
      const note = clamp7(mapping.note);
      this.send([0x90 | this.channel, note, 127]);
      const timestamp = this.nowMs() + Math.max(1, mapping.releaseMs ?? 12);
      this.send([0x80 | this.channel, note, 0], timestamp);
    }
  }

  private sendNoteOn(note: number, velocity: number): void {
    const midiNote = clamp7(note);
    this.activeNotes.add(midiNote);
    this.send([0x90 | this.channel, midiNote, clamp7(velocity)]);
  }

  private sendNoteOff(note: number): void {
    const midiNote = clamp7(note);
    this.activeNotes.delete(midiNote);
    this.send([0x80 | this.channel, midiNote, 0]);
  }

  private sendPitchBendNormalized(normalized: number): void {
    const clamped = Math.max(-1, Math.min(1, normalized));
    const raw = clamped >= 0
      ? 8192 + (clamped * 8191)
      : 8192 + (clamped * 8192);
    const value = clamp14(raw);
    this.send([
      0xe0 | this.channel,
      value & 0x7f,
      (value >> 7) & 0x7f,
    ]);
  }

  private sendPitchBendSensitivity(): void {
    const semitones = clamp7(this.bendRangeSemitones);

    // RPN 0,0 = Pitch Bend Sensitivity.
    this.sendCc(101, 0);
    this.sendCc(100, 0);
    this.sendCc(6, semitones);
    this.sendCc(38, 0);

    // Null the RPN selection afterwards.
    this.sendCc(101, 127);
    this.sendCc(100, 127);
  }

  private sendCc(controller: number, value: number): void {
    this.send([0xb0 | this.channel, clamp7(controller), clamp7(value)]);
  }

  private send(data: number[], timestamp?: number): void {
    this.output?.send(data, timestamp);
  }

  private normalizeChannel(channel: number): number {
    return Math.max(0, Math.min(15, Math.round(channel)));
  }

  private normalizeBendRange(semitones: number): number {
    return Math.max(1, Math.min(24, Math.round(semitones)));
  }

  private nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}
