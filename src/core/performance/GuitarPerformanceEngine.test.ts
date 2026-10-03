import { describe, expect, it } from 'vitest';
import { GuitarPerformanceEngine } from './GuitarPerformanceEngine';
import { getGuitarPerformanceProfile } from './GuitarPerformanceProfiles';
import type { LiveMidiMessage } from './LivePerformanceTypes';

function msg(
  kind: LiveMidiMessage['kind'],
  timestampMs: number,
  extra: Partial<LiveMidiMessage> = {},
): LiveMidiMessage {
  return {
    kind,
    deviceId: 'kbd',
    channel: 0,
    timestampMs,
    ...extra,
  };
}

function engine(profileId = 'guitar.lead.standard'): GuitarPerformanceEngine {
  const profile = getGuitarPerformanceProfile(profileId);
  if (!profile) throw new Error('Missing test profile');
  return new GuitarPerformanceEngine(profile);
}

describe('GuitarPerformanceEngine', () => {
  it('turns overlapping semitone/whole-tone notes into hammer-on and pull-off gestures', () => {
    const guitar = engine();

    expect(guitar.process(msg('note-on', 0, { note: 60, velocity: 100 }))).toEqual([
      expect.objectContaining({ kind: 'note-start', note: 60, transition: 'pick', retrigger: true }),
    ]);

    const hammer = guitar.process(msg('note-on', 10, { note: 62, velocity: 90 }));
    expect(hammer).toEqual([
      expect.objectContaining({ kind: 'articulation', articulationId: 'hammer-on' }),
      expect.objectContaining({ kind: 'note-end', note: 60 }),
      expect.objectContaining({ kind: 'note-start', note: 62, transition: 'hammer-on', retrigger: false }),
    ]);

    const pull = guitar.process(msg('note-off', 20, { note: 62, velocity: 0 }));
    expect(pull).toEqual([
      expect.objectContaining({ kind: 'articulation', articulationId: 'pull-off' }),
      expect.objectContaining({ kind: 'note-end', note: 62 }),
      expect.objectContaining({ kind: 'note-start', note: 60, transition: 'pull-off', retrigger: false }),
    ]);
  });

  it('detects slides for wider overlapping intervals', () => {
    const guitar = engine();
    guitar.process(msg('note-on', 0, { note: 60, velocity: 100 }));

    const events = guitar.process(msg('note-on', 10, { note: 65, velocity: 100 }));

    expect(events[0]).toEqual(expect.objectContaining({ articulationId: 'slide-up' }));
    expect(events[2]).toEqual(expect.objectContaining({ transition: 'slide-up', note: 65 }));
  });

  it('converts pitch wheel to the configured semitone bend range', () => {
    const guitar = engine('guitar.lead.wide-bend');

    const events = guitar.process(msg('pitch-bend', 0, { value: 16383, normalizedValue: 1 }));

    expect(events[0]).toEqual(expect.objectContaining({
      kind: 'bend',
      normalizedValue: 1,
      bendSemitones: 4,
      value: 4,
    }));
  });

  it('smooths vibrato controller changes without changing human note timing', () => {
    const guitar = engine('guitar.lead.expressive');

    const first = guitar.process(msg('control-change', 1000, {
      controller: 1,
      value: 0,
      normalizedValue: 0,
    }));
    const second = guitar.process(msg('control-change', 1010, {
      controller: 1,
      value: 127,
      normalizedValue: 1,
    }));

    expect(first[0]).toEqual(expect.objectContaining({ kind: 'vibrato', value: 0 }));
    expect(second[0].kind).toBe('vibrato');
    expect(second[0].value).toBeGreaterThan(0);
    expect(second[0].value).toBeLessThan(1);
    expect(second[0].timestampMs).toBe(1010);
  });

  it('maps expression, sustain and aftertouch-driven vibrato through the profile', () => {
    const guitar = engine('guitar.lead.expressive');

    expect(guitar.process(msg('control-change', 0, {
      controller: 11,
      value: 64,
      normalizedValue: 64 / 127,
    }))[0]).toEqual(expect.objectContaining({ kind: 'expression', normalizedValue: 64 / 127 }));

    expect(guitar.process(msg('control-change', 1, {
      controller: 64,
      value: 127,
      normalizedValue: 1,
    }))[0]).toEqual(expect.objectContaining({ kind: 'sustain', value: 1 }));

    expect(guitar.process(msg('channel-pressure', 20, {
      value: 100,
      normalizedValue: 100 / 127,
    }))[0].kind).toBe('vibrato');
  });

  it('uses low keyswitches as articulation commands instead of playable notes', () => {
    const guitar = engine();

    const events = guitar.process(msg('note-on', 0, { note: 25, velocity: 100 }));

    expect(events).toEqual([
      expect.objectContaining({ kind: 'articulation', articulationId: 'palm-mute' }),
    ]);
    expect(guitar.getSnapshot().activeNote).toBeNull();
    expect(guitar.getSnapshot().activeArticulationId).toBe('palm-mute');
  });

  it('keeps latched articulation state while reporting legato gestures separately', () => {
    const guitar = engine();

    guitar.process(msg('note-on', 0, { note: 25, velocity: 100 }));
    guitar.process(msg('note-on', 10, { note: 60, velocity: 100 }));
    guitar.process(msg('note-on', 20, { note: 62, velocity: 90 }));

    expect(guitar.getSnapshot()).toEqual(expect.objectContaining({
      activeArticulationId: 'palm-mute',
      lastTransition: 'hammer-on',
    }));
  });

  it('supports poly mode without forcing monophonic transitions', () => {
    const profile = getGuitarPerformanceProfile('guitar.lead.standard');
    if (!profile) throw new Error('Missing test profile');
    const guitar = new GuitarPerformanceEngine(profile, { mode: 'poly' });

    guitar.process(msg('note-on', 0, { note: 60, velocity: 100 }));
    const events = guitar.process(msg('note-on', 1, { note: 64, velocity: 100 }));

    expect(events).toEqual([
      expect.objectContaining({ kind: 'note-start', note: 64, transition: 'pick', retrigger: true }),
    ]);
    expect(guitar.getSnapshot().heldNotes).toEqual([60, 64]);
  });
});
