import type {
  InstrumentAdapterDescriptor,
  PerformanceEvent,
} from '../LivePerformanceTypes';

export interface InstrumentArticulationMidiMapping {
  type: 'keyswitch' | 'cc';
  note?: number;
  controller?: number;
  value?: number;
  releaseMs?: number;
}

export interface InstrumentPerformanceAdapter {
  readonly descriptor: InstrumentAdapterDescriptor;
  activate(): void | Promise<void>;
  deactivate(): void | Promise<void>;
  handleEvents(events: PerformanceEvent[]): void;
  panic(): void;
}

export interface ExternalMidiAdapterOptions {
  output: MIDIOutput | null;
  channel: number;
  bendRangeSemitones: number;
  articulationMap: Record<string, InstrumentArticulationMidiMapping>;
}

export interface MidiOutputDescriptor {
  id: string;
  name: string;
  manufacturer: string;
  state: MIDIPortDeviceState;
}
