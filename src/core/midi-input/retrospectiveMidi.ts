import type { LiveMidiMessage } from '../performance/LivePerformanceTypes';
import type { MidiPressureKind } from '../midi/KGMidiPressureEvent';

export interface RetrospectiveNoteData {
  startBeat: number;
  endBeat: number;
  pitch: number;
  velocity: number;
}

export interface RetrospectivePitchBendData {
  beat: number;
  value: number;
}

export interface RetrospectiveControllerData {
  controller: number;
  beat: number;
  value: number;
}

export interface RetrospectivePressureData {
  kind: MidiPressureKind;
  note: number | null;
  beat: number;
  value: number;
}

export interface RetrospectiveMidiCapture {
  notes: RetrospectiveNoteData[];
  pitchBends: RetrospectivePitchBendData[];
  controllers: RetrospectiveControllerData[];
  pressureEvents: RetrospectivePressureData[];
}

interface ActiveNote {
  startBeat: number;
  pitch: number;
  velocity: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Converts timestamped live MIDI messages into region-relative performance data.
 * The newest buffered message is aligned with anchorBeatAbsolute.
 */
export function buildRetrospectiveMidiCapture(
  messages: LiveMidiMessage[],
  anchorBeatAbsolute: number,
  regionStartBeat: number,
  regionLength: number,
  bpm: number,
): RetrospectiveMidiCapture {
  const result: RetrospectiveMidiCapture = {
    notes: [],
    pitchBends: [],
    controllers: [],
    pressureEvents: [],
  };

  if (messages.length === 0 || bpm <= 0 || regionLength <= 0) {
    return result;
  }

  const ordered = [...messages].sort((a, b) => a.timestampMs - b.timestampMs);
  const lastTimestamp = ordered[ordered.length - 1].timestampMs;
  const beatsPerSecond = bpm / 60;
  const maxRelativeBeat = regionLength;

  const toRelativeBeat = (timestampMs: number): number => {
    const elapsedSecondsBeforeAnchor = (lastTimestamp - timestampMs) / 1000;
    const absoluteBeat = anchorBeatAbsolute - (elapsedSecondsBeforeAnchor * beatsPerSecond);
    return clamp(absoluteBeat - regionStartBeat, 0, maxRelativeBeat);
  };

  const activeNotes = new Map<string, ActiveNote>();
  const lastPitchBendByChannel = new Map<number, number>();
  const lastControllerValues = new Map<string, number>();
  const lastPressureValues = new Map<string, number>();

  const finalizeActiveNote = (key: string, endBeat: number) => {
    const active = activeNotes.get(key);
    if (!active) return;
    activeNotes.delete(key);
    if (endBeat <= active.startBeat) return;
    result.notes.push({
      startBeat: active.startBeat,
      endBeat,
      pitch: active.pitch,
      velocity: active.velocity,
    });
  };

  for (const message of ordered) {
    const beat = toRelativeBeat(message.timestampMs);
    const note = message.note ?? 0;
    const key = `${message.deviceId}:${message.channel}:${note}`;

    if (message.kind === 'note-on' && message.note !== undefined && (message.velocity ?? 0) > 0) {
      finalizeActiveNote(key, beat);
      activeNotes.set(key, {
        startBeat: beat,
        pitch: message.note,
        velocity: message.velocity ?? 127,
      });
      continue;
    }

    if (message.kind === 'note-off' && message.note !== undefined) {
      finalizeActiveNote(key, beat);
      continue;
    }

    if (message.kind === 'pitch-bend' && message.value !== undefined) {
      if (lastPitchBendByChannel.get(message.channel) !== message.value) {
        lastPitchBendByChannel.set(message.channel, message.value);
        result.pitchBends.push({ beat, value: message.value });
      }
      continue;
    }

    if (message.kind === 'control-change' && message.controller !== undefined && message.value !== undefined) {
      const controllerKey = `${message.channel}:${message.controller}`;
      if (lastControllerValues.get(controllerKey) !== message.value) {
        lastControllerValues.set(controllerKey, message.value);
        result.controllers.push({
          controller: message.controller,
          beat,
          value: message.value,
        });
      }
      continue;
    }

    if (message.kind === 'channel-pressure' && message.value !== undefined) {
      const pressureKey = `channel:${message.channel}`;
      if (lastPressureValues.get(pressureKey) !== message.value) {
        lastPressureValues.set(pressureKey, message.value);
        result.pressureEvents.push({
          kind: 'channel',
          note: null,
          beat,
          value: message.value,
        });
      }
      continue;
    }

    if (message.kind === 'poly-aftertouch' && message.note !== undefined && message.value !== undefined) {
      const pressureKey = `poly:${message.channel}:${message.note}`;
      if (lastPressureValues.get(pressureKey) !== message.value) {
        lastPressureValues.set(pressureKey, message.value);
        result.pressureEvents.push({
          kind: 'poly',
          note: message.note,
          beat,
          value: message.value,
        });
      }
    }
  }

  const anchorRelativeBeat = clamp(anchorBeatAbsolute - regionStartBeat, 0, maxRelativeBeat);
  for (const key of [...activeNotes.keys()]) {
    finalizeActiveNote(key, anchorRelativeBeat);
  }

  result.notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
  result.pitchBends.sort((a, b) => a.beat - b.beat);
  result.controllers.sort((a, b) => a.beat - b.beat || a.controller - b.controller);
  result.pressureEvents.sort((a, b) => a.beat - b.beat || (a.note ?? -1) - (b.note ?? -1));

  return result;
}
