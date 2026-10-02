import { describe, expect, it } from 'vitest';
import { buildRetrospectiveMidiCapture } from './retrospectiveMidi';
import type { LiveMidiMessage } from '../performance/LivePerformanceTypes';

function msg(partial: Partial<LiveMidiMessage> & Pick<LiveMidiMessage, 'kind' | 'timestampMs'>): LiveMidiMessage {
  return {
    deviceId: 'kbd',
    channel: 0,
    ...partial,
  };
}

describe('buildRetrospectiveMidiCapture', () => {
  it('rebuilds notes and expressive events relative to the current playhead', () => {
    const capture = buildRetrospectiveMidiCapture([
      msg({ kind: 'note-on', timestampMs: 1000, note: 60, velocity: 100 }),
      msg({ kind: 'pitch-bend', timestampMs: 1250, value: 10000 }),
      msg({ kind: 'control-change', timestampMs: 1500, controller: 1, value: 70 }),
      msg({ kind: 'channel-pressure', timestampMs: 1600, value: 80 }),
      msg({ kind: 'poly-aftertouch', timestampMs: 1700, note: 60, value: 90 }),
      msg({ kind: 'note-off', timestampMs: 2000, note: 60, velocity: 0 }),
    ], 8, 0, 16, 120);

    expect(capture.notes).toEqual([
      { startBeat: 6, endBeat: 8, pitch: 60, velocity: 100 },
    ]);
    expect(capture.pitchBends[0]).toEqual({ beat: 6.5, value: 10000 });
    expect(capture.controllers[0]).toEqual({ controller: 1, beat: 7, value: 70 });
    expect(capture.pressureEvents).toEqual([
      { kind: 'channel', note: null, beat: 7.2, value: 80 },
      { kind: 'poly', note: 60, beat: 7.4, value: 90 },
    ]);
  });

  it('closes held notes at the anchor and clamps events to the region', () => {
    const capture = buildRetrospectiveMidiCapture([
      msg({ kind: 'note-on', timestampMs: 0, note: 64, velocity: 90 }),
      msg({ kind: 'control-change', timestampMs: 1000, controller: 11, value: 100 }),
    ], 12, 10, 4, 60);

    expect(capture.notes).toEqual([
      { startBeat: 1, endBeat: 2, pitch: 64, velocity: 90 },
    ]);
    expect(capture.controllers).toEqual([
      { controller: 11, beat: 2, value: 100 },
    ]);
  });
});
