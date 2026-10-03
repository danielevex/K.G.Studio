import { describe, expect, it, vi } from 'vitest';
import { ExternalMidiInstrumentAdapter, DEFAULT_GUITAR_ARTICULATION_MIDI_MAP } from './ExternalMidiInstrumentAdapter';
import type { PerformanceEvent } from '../LivePerformanceTypes';

function createOutput() {
  const send = vi.fn();
  return {
    id: 'loop-midi',
    name: 'K.G.Studio Guitar Out',
    manufacturer: 'test',
    state: 'connected',
    send,
  } as unknown as MIDIOutput & { send: ReturnType<typeof vi.fn> };
}

function event(partial: Partial<PerformanceEvent> & Pick<PerformanceEvent, 'kind'>): PerformanceEvent {
  return {
    timestampMs: 0,
    channel: 0,
    ...partial,
  };
}

describe('ExternalMidiInstrumentAdapter', () => {
  it('configures external pitch bend sensitivity with MIDI RPN', () => {
    const output = createOutput();
    const adapter = new ExternalMidiInstrumentAdapter({
      output,
      channel: 2,
      bendRangeSemitones: 4,
      articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
    });

    adapter.activate();

    expect(output.send).toHaveBeenCalledWith([0xb2, 101, 0], undefined);
    expect(output.send).toHaveBeenCalledWith([0xb2, 100, 0], undefined);
    expect(output.send).toHaveBeenCalledWith([0xb2, 6, 4], undefined);
    expect(output.send).toHaveBeenCalledWith([0xb2, 38, 0], undefined);
  });

  it('orders legato transitions note-on before previous note-off', () => {
    const output = createOutput();
    const adapter = new ExternalMidiInstrumentAdapter({
      output,
      channel: 0,
      bendRangeSemitones: 2,
      articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
    });
    adapter.activate();
    output.send.mockClear();

    adapter.handleEvents([
      event({ kind: 'articulation', articulationId: 'hammer-on' }),
      event({ kind: 'note-end', note: 60 }),
      event({ kind: 'note-start', note: 62, velocity: 95, transition: 'hammer-on', retrigger: false }),
    ]);

    const calls = output.send.mock.calls.map(call => call[0]);
    expect(calls[0]).toEqual([0x90, 62, 95]);
    expect(calls[1]).toEqual([0x80, 60, 0]);
  });

  it('maps expressive events to pitch bend and standard MIDI CCs', () => {
    const output = createOutput();
    const adapter = new ExternalMidiInstrumentAdapter({
      output,
      channel: 0,
      bendRangeSemitones: 2,
      articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
    });
    adapter.activate();
    output.send.mockClear();

    adapter.handleEvents([
      event({ kind: 'bend', normalizedValue: 1 }),
      event({ kind: 'vibrato', normalizedValue: 0.5 }),
      event({ kind: 'expression', normalizedValue: 0.25 }),
      event({ kind: 'sustain', value: 1 }),
    ]);

    expect(output.send).toHaveBeenCalledWith([0xe0, 0x7f, 0x7f], undefined);
    expect(output.send).toHaveBeenCalledWith([0xb0, 1, 64], undefined);
    expect(output.send).toHaveBeenCalledWith([0xb0, 11, 32], undefined);
    expect(output.send).toHaveBeenCalledWith([0xb0, 64, 127], undefined);
  });

  it('translates persistent articulations to keyswitches', () => {
    const output = createOutput();
    const adapter = new ExternalMidiInstrumentAdapter({
      output,
      channel: 0,
      bendRangeSemitones: 2,
      articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
    });
    adapter.activate();
    output.send.mockClear();

    adapter.handleEvents([
      event({ kind: 'articulation', articulationId: 'palm-mute' }),
    ]);

    expect(output.send.mock.calls[0][0]).toEqual([0x90, 25, 127]);
    expect(output.send.mock.calls[1][0]).toEqual([0x80, 25, 0]);
    expect(typeof output.send.mock.calls[1][1]).toBe('number');
  });

  it('sends a complete panic/reset sequence', () => {
    const output = createOutput();
    const adapter = new ExternalMidiInstrumentAdapter({
      output,
      channel: 0,
      bendRangeSemitones: 2,
      articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
    });
    adapter.activate();
    adapter.handleEvents([event({ kind: 'note-start', note: 64, velocity: 100, retrigger: true })]);
    output.send.mockClear();

    adapter.panic();

    const sent = output.send.mock.calls.map(call => call[0]);
    expect(sent).toContainEqual([0x80, 64, 0]);
    expect(sent).toContainEqual([0xb0, 123, 0]);
    expect(sent).toContainEqual([0xb0, 120, 0]);
    expect(sent).toContainEqual([0xe0, 0, 64]);
  });
});
