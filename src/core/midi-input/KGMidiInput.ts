import { KGAudioInterface } from '../audio-interface/KGAudioInterface';
import { useProjectStore } from '../../stores/projectStore';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { ConfigManager } from '../config/ConfigManager';
import { GuitarPerformanceEngine } from '../performance/GuitarPerformanceEngine';
import { GUITAR_PERFORMANCE_PROFILES, getGuitarPerformanceProfile } from '../performance/GuitarPerformanceProfiles';
import { GILMOUR_INSPIRED_PRESETS, getPerformancePreset } from '../performance/PerformancePresets';
import {
  DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
  ExternalMidiInstrumentAdapter,
} from '../performance/adapters/ExternalMidiInstrumentAdapter';
import { getInstrumentBackendDescriptors } from '../performance/adapters/InstrumentAdapterRegistry';
import type { MidiOutputDescriptor } from '../performance/adapters/InstrumentPerformanceAdapter';
import type {
  GuitarPerformanceSnapshot,
  LiveMidiMessage,
  PerformanceEvent,
  PerformanceProfile,
  InstrumentAdapterDescriptor,
  PerformancePreset,
  SignalChainBlock,
} from '../performance/LivePerformanceTypes';

export interface LiveMidiNoteActivityEvent {
  pitch: number;
  isNoteOn: boolean;
}

type LiveNoteActivityListener = (...args: [LiveMidiNoteActivityEvent]) => void;
type LiveMidiMessageListener = (...args: [LiveMidiMessage]) => void;
type PerformanceEventListener = (...args: [PerformanceEvent]) => void;
type MidiStateListener = () => void;

export interface MidiInputDescriptor {
  id: string;
  name: string;
  manufacturer: string;
  state: MIDIPortDeviceState;
}

export interface MidiLearnResult {
  kind: 'cc' | 'pitch-wheel' | 'channel-aftertouch' | 'poly-aftertouch' | 'note';
  deviceId: string;
  channel: number;
  controller?: number;
  note?: number;
}

/**
 * KGMidiInput - MIDI input manager for the DAW
 * Implements the singleton pattern for global MIDI device management
 * Handles Web MIDI API integration for keyboard input
 */
export class KGMidiInput {
  private static readonly PITCH_BEND_CENTER = 8192;
  private static readonly PITCH_BEND_MAX_OFFSET = 8192;
  private static readonly CONTROL_CHANGE_MODULATION = 1;
  private static readonly CONTROL_CHANGE_BREATH = 2;
  private static readonly CONTROL_CHANGE_CHANNEL_VOLUME = 7;
  private static readonly CONTROL_CHANGE_EXPRESSION = 11;
  private static readonly CONTROL_CHANGE_SUSTAIN = 64;
  private static readonly SUSTAIN_ON_THRESHOLD = 64;

  // Private static instance for singleton pattern
  private static _instance: KGMidiInput | null = null;

  // MIDI state
  private midiAccess: MIDIAccess | null = null;
  private isInitialized: boolean = false;
  private connectedInputs: Map<string, MIDIInput> = new Map();
  private selectedInputId: string | null = null;
  private channelFilter: number | null = null;
  private stateVersion = 0;
  private stateListeners: Set<MidiStateListener> = new Set();
  private liveMidiMessageListeners: Set<LiveMidiMessageListener> = new Set();
  private performanceEventListeners: Set<PerformanceEventListener> = new Set();
  private midiLearnListener: ((result: MidiLearnResult) => void) | null = null;
  private midiLearnArmed = false;
  private retrospectiveBuffer: LiveMidiMessage[] = [];
  private retrospectiveDurationSeconds = 30;
  private performanceProfileId: string = 'off';
  private guitarPerformanceEngine: GuitarPerformanceEngine | null = null;
  private guitarPerformanceTrackId: string | null = null;
  private instrumentBackendId: 'internal-sampler' | 'external-midi' = 'internal-sampler';
  private selectedOutputId: string = '';
  private externalMidiChannel: number = 0;
  private externalMidiAdapter = new ExternalMidiInstrumentAdapter({
    output: null,
    channel: 0,
    bendRangeSemitones: 2,
    articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
  });

  // Recording callbacks
  private onRecordNoteOn: ((pitch: number, velocity: number) => void) | null = null;
  private onRecordNoteOff: ((pitch: number) => void) | null = null;
  private onRecordPitchBend: ((value: number) => void) | null = null;
  private onRecordControlChange: ((controller: number, value: number) => void) | null = null;
  private onRecordPressure: ((kind: 'channel' | 'poly', note: number | null, value: number) => void) | null = null;
  private liveNoteTrackOwnership: Map<number, string[]> = new Map();
  private sustainPolarityInverted: boolean | null = null;
  private liveNoteActivityListeners: LiveNoteActivityListener[] = [];

  // Private constructor to prevent direct instantiation
  private constructor() {
    console.log("KGMidiInput initialized");
  }

  /**
   * Get the singleton instance of KGMidiInput
   * Creates the instance if it doesn't exist yet
   */
  public static instance(): KGMidiInput {
    if (!KGMidiInput._instance) {
      KGMidiInput._instance = new KGMidiInput();
    }
    return KGMidiInput._instance;
  }

  /**
   * Initialize the MIDI input manager
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log("KGMidiInput ready for MIDI access request");
      this.isInitialized = true;
      this.loadPerformanceConfiguration();
    } catch (error) {
      console.error("Failed to initialize MIDI input manager:", error);
      throw error;
    }
  }

  /**
   * Request MIDI access from browser
   * This must be called after a user gesture (click, keydown, etc.)
   */
  public async requestMIDIAccess(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.midiAccess) {
      console.log("MIDI access already granted");
      return;
    }

    try {
      // Check if Web MIDI API is available
      if (!navigator.requestMIDIAccess) {
        throw new Error("Web MIDI API is not supported in this browser");
      }

      // Request MIDI access
      this.midiAccess = await navigator.requestMIDIAccess();
      console.log("MIDI access granted");

      // Set up device listeners
      this.setupDeviceListeners();

      // Connect to all existing inputs and resolve any saved external MIDI output.
      this.connectToAllInputs();
      this.refreshExternalMidiAdapter();
      this.notifyStateChange();
    } catch (error) {
      console.error("Failed to request MIDI access:", error);
      throw error;
    }
  }

  /**
   * Set up listeners for MIDI device connection/disconnection
   */
  private setupDeviceListeners(): void {
    if (!this.midiAccess) {
      return;
    }

    this.midiAccess.onstatechange = (event: MIDIConnectionEvent) => {
      const port = event.port;

      if (port?.type === "input") {
        if (port.state === "connected") {
          console.log(`MIDI device connected: ${port.name}`);
          this.connectToInput(port as MIDIInput);
        } else if (port.state === "disconnected") {
          console.log(`MIDI device disconnected: ${port.name}`);
          this.disconnectFromInput(port.id);
        }
      } else if (port?.type === "output") {
        console.log(`MIDI output ${port.state}: ${port.name}`);
        this.refreshExternalMidiAdapter();
      }

      if (port) {
        this.notifyStateChange();
      }
    };
  }

  /**
   * Connect to all available MIDI inputs
   */
  private connectToAllInputs(): void {
    if (!this.midiAccess) {
      return;
    }

    this.midiAccess.inputs.forEach((input) => {
      this.connectToInput(input);
    });

    console.log(`Connected to ${this.connectedInputs.size} MIDI input device(s)`);
  }

  /**
   * Connect to a specific MIDI input
   */
  private connectToInput(input: MIDIInput): void {
    // Set up message handler
    input.onmidimessage = (event: MIDIMessageEvent) => {
      this.handleMIDIMessage(event, input.id);
    };

    // Store the input
    this.connectedInputs.set(input.id, input);

    console.log(`Listening to MIDI input: ${input.name} (${input.id})`);
    this.notifyStateChange();
  }

  /**
   * Disconnect from a specific MIDI input
   */
  private disconnectFromInput(inputId: string): void {
    const input = this.connectedInputs.get(inputId);
    if (input) {
      input.onmidimessage = null;
    }
    this.connectedInputs.delete(inputId);
    if (this.selectedInputId === inputId) {
      this.selectedInputId = null;
    }
    this.notifyStateChange();
  }

  /**
   * Handle incoming MIDI messages.
   * sourceInputId is supplied by real Web MIDI inputs; tests may omit it.
   */
  private handleMIDIMessage(event: MIDIMessageEvent, sourceInputId?: string): void {
    if (!event.data || event.data.length === 0) {
      return;
    }

    if (this.selectedInputId && sourceInputId && sourceInputId !== this.selectedInputId) {
      return;
    }

    const status = event.data[0] ?? 0;
    const data1 = event.data[1] ?? 0;
    const data2 = event.data[2] ?? 0;
    const command = status & 0xf0;
    const channel = status & 0x0f;

    // System messages do not carry a normal MIDI channel and are outside LP1.
    if (command === 0xf0) {
      return;
    }

    if (this.channelFilter !== null && channel !== this.channelFilter) {
      return;
    }

    const deviceId = sourceInputId ?? this.selectedInputId ?? 'unknown';
    const baseMessage = {
      deviceId,
      channel,
      timestampMs: event.timeStamp ?? performance.now(),
      data1,
      data2,
    };

    // Note On: command = 0x90 (144)
    if (command === 0x90 && data2 > 0) {
      const message: LiveMidiMessage = {
        ...baseMessage,
        kind: 'note-on',
        note: data1,
        velocity: data2,
        value: data2,
        normalizedValue: data2 / 127,
      };
      this.emitLiveMidiMessage(message);
      this.resolveMidiLearn(message);
      console.log(`MIDI Note On: pitch=${data1}, velocity=${data2}, channel=${channel}`);
      const isKeyswitch = this.guitarPerformanceEngine?.isKeyswitchNote(data1) ?? false;
      if (!isKeyswitch) {
        this.emitLiveNoteActivity({ pitch: data1, isNoteOn: true });
      }
      if (!this.routeGuitarPerformanceMessage(message)) {
        this.triggerNoteOn(data1, data2);
      }
      if (!isKeyswitch) {
        this.onRecordNoteOn?.(data1, data2);
      }
    }
    // Note Off: command = 0x80 (128) or Note On with velocity 0
    else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      const message: LiveMidiMessage = {
        ...baseMessage,
        kind: 'note-off',
        note: data1,
        velocity: data2,
        value: data2,
        normalizedValue: data2 / 127,
      };
      this.emitLiveMidiMessage(message);
      console.log(`MIDI Note Off: pitch=${data1}, channel=${channel}`);
      const isKeyswitch = this.guitarPerformanceEngine?.isKeyswitchNote(data1) ?? false;
      if (!isKeyswitch) {
        this.emitLiveNoteActivity({ pitch: data1, isNoteOn: false });
      }
      if (!this.routeGuitarPerformanceMessage(message)) {
        this.triggerNoteOff(data1);
      }
      if (!isKeyswitch) {
        this.onRecordNoteOff?.(data1);
      }
    }
    // Polyphonic Key Pressure: command = 0xA0 (160)
    else if (command === 0xa0) {
      const message: LiveMidiMessage = {
        ...baseMessage,
        kind: 'poly-aftertouch',
        note: data1,
        value: data2,
        normalizedValue: data2 / 127,
      };
      this.emitLiveMidiMessage(message);
      this.resolveMidiLearn(message);
      this.routeGuitarPerformanceMessage(message);
      this.onRecordPressure?.('poly', data1, data2);
    }
    // Control Change: command = 0xB0 (176)
    else if (command === 0xb0) {
      const message: LiveMidiMessage = {
        ...baseMessage,
        kind: 'control-change',
        controller: data1,
        value: data2,
        normalizedValue: data2 / 127,
      };
      this.emitLiveMidiMessage(message);
      this.resolveMidiLearn(message);
      console.log(`MIDI Control Change: controller=${data1}, value=${data2}, channel=${channel}`);
      this.handleControlChange(message);
    }
    // Program Change: command = 0xC0 (192)
    else if (command === 0xc0) {
      this.emitLiveMidiMessage({
        ...baseMessage,
        kind: 'program-change',
        value: data1,
        normalizedValue: data1 / 127,
      });
    }
    // Channel Pressure: command = 0xD0 (208)
    else if (command === 0xd0) {
      const message: LiveMidiMessage = {
        ...baseMessage,
        kind: 'channel-pressure',
        value: data1,
        normalizedValue: data1 / 127,
      };
      this.emitLiveMidiMessage(message);
      this.resolveMidiLearn(message);
      this.routeGuitarPerformanceMessage(message);
      this.onRecordPressure?.('channel', null, data1);
    }
    // Pitch Bend: command = 0xE0 (224)
    else if (command === 0xe0) {
      const pitchBendValue = (data2 << 7) | data1;
      const normalizedValue = this.normalizePitchBend(pitchBendValue);
      const message: LiveMidiMessage = {
        ...baseMessage,
        kind: 'pitch-bend',
        value: pitchBendValue,
        normalizedValue,
      };
      this.emitLiveMidiMessage(message);
      this.resolveMidiLearn(message);
      console.log(`MIDI Pitch Bend: value=${pitchBendValue}, channel=${channel}`);
      if (!this.routeGuitarPerformanceMessage(message)) {
        this.triggerPitchBend(normalizedValue);
      }
      this.onRecordPitchBend?.(pitchBendValue);
    }
  }

  private emitLiveMidiMessage(message: LiveMidiMessage): void {
    this.retrospectiveBuffer.push(message);
    this.pruneRetrospectiveBuffer(message.timestampMs);

    for (const listener of this.liveMidiMessageListeners) {
      try {
        listener(message);
      } catch {
        // Listener failures must never interrupt live MIDI processing.
      }
    }
  }

  private pruneRetrospectiveBuffer(nowMs: number): void {
    const cutoff = nowMs - (this.retrospectiveDurationSeconds * 1000);
    let firstValidIndex = 0;
    while (
      firstValidIndex < this.retrospectiveBuffer.length
      && this.retrospectiveBuffer[firstValidIndex].timestampMs < cutoff
    ) {
      firstValidIndex += 1;
    }
    if (firstValidIndex > 0) {
      this.retrospectiveBuffer.splice(0, firstValidIndex);
    }
  }

  private resolveMidiLearn(message: LiveMidiMessage): void {
    if (!this.midiLearnArmed || !this.midiLearnListener) {
      return;
    }

    let result: MidiLearnResult | null = null;
    if (message.kind === 'control-change' && message.controller !== undefined) {
      result = {
        kind: 'cc',
        deviceId: message.deviceId,
        channel: message.channel,
        controller: message.controller,
      };
    } else if (message.kind === 'pitch-bend') {
      result = { kind: 'pitch-wheel', deviceId: message.deviceId, channel: message.channel };
    } else if (message.kind === 'channel-pressure') {
      result = { kind: 'channel-aftertouch', deviceId: message.deviceId, channel: message.channel };
    } else if (message.kind === 'poly-aftertouch') {
      result = {
        kind: 'poly-aftertouch',
        deviceId: message.deviceId,
        channel: message.channel,
        note: message.note,
      };
    } else if (message.kind === 'note-on') {
      result = {
        kind: 'note',
        deviceId: message.deviceId,
        channel: message.channel,
        note: message.note,
      };
    }

    if (!result) {
      return;
    }

    const listener = this.midiLearnListener;
    this.midiLearnListener = null;
    this.midiLearnArmed = false;
    this.notifyStateChange();
    listener(result);
  }

  private notifyStateChange(): void {
    this.stateVersion += 1;
    for (const listener of this.stateListeners) {
      try {
        listener();
      } catch {
        // State subscribers are UI helpers and must not break MIDI input.
      }
    }
  }

  /**
   * Trigger note on - play sound for MIDI note
   */
  private triggerNoteOn(pitch: number, velocity: number): void {
    try {
      const selectedTrackId = this.getSelectedMidiTrackId();
      if (!selectedTrackId) {
        return;
      }

      // Get audio interface and start playing the note
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized()) {
        // Try to start audio context if not started yet
        if (!audioInterface.getIsAudioContextStarted()) {
          audioInterface.startAudioContext().catch(() => {
            // Silently fail if still not allowed - browser policy
          });
        }

        // Trigger note attack if audio context is ready
        if (audioInterface.getIsAudioContextStarted()) {
          this.latchTrackIdForPitch(pitch, selectedTrackId);
          audioInterface.triggerLiveMidiNoteAttack(selectedTrackId, pitch, velocity);
          console.log(`MIDI triggered note attack: pitch=${pitch}, velocity=${velocity}, track=${selectedTrackId}`);
        }
      }
    } catch (error) {
      console.error(`Error triggering MIDI note on (pitch ${pitch}):`, error);
    }
  }

  /**
   * Trigger note off - stop sound for MIDI note
   */
  private triggerNoteOff(pitch: number): void {
    try {
      const selectedTrackId = this.consumeLatchedTrackIdForPitch(pitch);
      if (!selectedTrackId) {
        return;
      }

      // Get audio interface and stop playing the note
      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized() && audioInterface.getIsAudioContextStarted()) {
        audioInterface.releaseLiveMidiNote(selectedTrackId, pitch);
        console.log(`MIDI released note: pitch=${pitch}, track=${selectedTrackId}`);
      }
    } catch (error) {
      console.error(`Error triggering MIDI note off (pitch ${pitch}):`, error);
    }
  }

  private triggerPitchBend(normalizedBend: number): void {
    try {
      const selectedTrackId = this.getSelectedMidiTrackId();
      if (!selectedTrackId) {
        return;
      }

      const audioInterface = KGAudioInterface.instance();
      if (audioInterface.getIsInitialized() && audioInterface.getIsAudioContextStarted()) {
        audioInterface.setLiveMidiPitchBend(selectedTrackId, normalizedBend);
      }
    } catch (error) {
      console.error(`Error applying MIDI pitch bend (${normalizedBend}):`, error);
    }
  }

  private normalizePitchBend(pitchBendValue: number): number {
    const normalizedBend = (pitchBendValue - KGMidiInput.PITCH_BEND_CENTER) / KGMidiInput.PITCH_BEND_MAX_OFFSET;
    return Math.max(-1, Math.min(1, normalizedBend));
  }

  private handleControlChange(message: LiveMidiMessage): void {
    const controller = message.controller;
    if (controller === undefined) {
      return;
    }

    let effectiveMessage = message;
    if (controller === KGMidiInput.CONTROL_CHANGE_SUSTAIN) {
      const isPressed = this.normalizeSustainPedalValue(message.value ?? 0);
      const normalizedValue = isPressed ? 1 : 0;
      effectiveMessage = {
        ...message,
        value: isPressed ? 127 : 0,
        normalizedValue,
      };
      this.onRecordControlChange?.(controller, isPressed ? 127 : 0);
    } else {
      this.onRecordControlChange?.(controller, message.value ?? 0);
    }

    if (this.routeGuitarPerformanceMessage(effectiveMessage)) {
      return;
    }

    const selectedTrackId = this.getSelectedMidiTrackId();
    if (!selectedTrackId) {
      return;
    }

    const audioInterface = KGAudioInterface.instance();
    if (!audioInterface.getIsInitialized() || !audioInterface.getIsAudioContextStarted()) {
      return;
    }

    if (controller === KGMidiInput.CONTROL_CHANGE_SUSTAIN) {
      audioInterface.setLiveMidiSustain(selectedTrackId, (effectiveMessage.normalizedValue ?? 0) >= 0.5);
      return;
    }

    if (
      controller === KGMidiInput.CONTROL_CHANGE_MODULATION ||
      controller === KGMidiInput.CONTROL_CHANGE_BREATH ||
      controller === KGMidiInput.CONTROL_CHANGE_CHANNEL_VOLUME ||
      controller === KGMidiInput.CONTROL_CHANGE_EXPRESSION
    ) {
      audioInterface.setLiveMidiExpression(selectedTrackId, (message.value ?? 0) / 127);
    }
  }

  private loadPerformanceConfiguration(): void {
    const config = ConfigManager.instance();
    if (!config.getIsInitialized()) {
      return;
    }

    const profileId = (config.get('performance.profile_id') as string | undefined) ?? 'off';
    const bendRange = Number(config.get('performance.guitar_bend_range_semitones') ?? 2);
    const smoothingMs = Number(config.get('performance.guitar_vibrato_smoothing_ms') ?? 45);
    const backendId = String(config.get('performance.instrument_backend_id') ?? 'internal-sampler');
    this.instrumentBackendId = backendId === 'external-midi' ? 'external-midi' : 'internal-sampler';
    this.selectedOutputId = String(config.get('performance.external_midi_output_id') ?? '');
    this.externalMidiChannel = Math.max(0, Math.min(
      15,
      Math.round(Number(config.get('performance.external_midi_channel') ?? 0)),
    ));

    this.externalMidiAdapter.configure({
      output: null,
      channel: this.externalMidiChannel,
      bendRangeSemitones: bendRange,
      articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
    });

    this.applyPerformanceProfile(profileId, {
      bendRangeSemitones: bendRange,
      vibratoSmoothingMs: smoothingMs,
    });
  }

  private routeGuitarPerformanceMessage(message: LiveMidiMessage): boolean {
    const engine = this.guitarPerformanceEngine;
    if (!engine) {
      return false;
    }

    const events = engine.process(message);
    this.emitPerformanceEvents(events);

    if (this.instrumentBackendId === 'external-midi') {
      this.externalMidiAdapter.handleEvents(events);
    } else {
      this.routePerformanceEvents(events);
    }

    const snapshot = engine.getSnapshot();
    if (snapshot.activeNote === null && snapshot.heldNotes.length === 0 && !snapshot.sustain) {
      if (this.instrumentBackendId === 'internal-sampler' && this.guitarPerformanceTrackId) {
        KGAudioInterface.instance().setLiveMidiVibrato(this.guitarPerformanceTrackId, 0);
      }
      this.guitarPerformanceTrackId = null;
    }

    return true;
  }

  private emitPerformanceEvents(events: PerformanceEvent[]): void {
    for (const event of events) {
      for (const listener of this.performanceEventListeners) {
        try {
          listener(event);
        } catch {
          // Adapter/monitor listeners must never interrupt low-latency MIDI routing.
        }
      }
    }
  }

  private routePerformanceEvents(events: PerformanceEvent[]): void {
    if (events.length === 0) {
      return;
    }

    const audioInterface = KGAudioInterface.instance();
    const settings = this.guitarPerformanceEngine?.getSettings();
    const selectedTrackId = this.guitarPerformanceTrackId ?? this.getSelectedMidiTrackId();

    if (!selectedTrackId) {
      return;
    }

    if (!audioInterface.getIsInitialized()) {
      return;
    }

    if (!audioInterface.getIsAudioContextStarted()) {
      audioInterface.startAudioContext().catch(() => {
        // Browser gesture policy can still reject the first live event.
      });
      if (!audioInterface.getIsAudioContextStarted()) {
        return;
      }
    }

    if (settings) {
      audioInterface.setLiveMidiPitchBendRange(selectedTrackId, settings.bendRangeSemitones);
    }

    for (const event of events) {
      if (event.kind === 'note-start' && event.note !== undefined) {
        const trackId = this.guitarPerformanceTrackId ?? selectedTrackId;
        this.guitarPerformanceTrackId = trackId;
        this.latchTrackIdForPitch(event.note, trackId);
        audioInterface.triggerLiveMidiNoteAttack(trackId, event.note, event.velocity ?? 127);
        const snapshot = this.guitarPerformanceEngine?.getSnapshot();
        if (settings && snapshot && snapshot.vibrato > 0) {
          audioInterface.setLiveMidiVibrato(
            trackId,
            snapshot.vibrato,
            settings.vibratoMaxSemitones ?? 0.35,
            settings.vibratoRateHz ?? 5.5,
          );
        }
        continue;
      }

      if (event.kind === 'note-end' && event.note !== undefined) {
        const trackId = this.consumeLatchedTrackIdForPitch(event.note)
          ?? this.guitarPerformanceTrackId
          ?? selectedTrackId;
        audioInterface.releaseLiveMidiNote(trackId, event.note);
        continue;
      }

      const trackId = this.guitarPerformanceTrackId ?? selectedTrackId;
      if (event.kind === 'bend') {
        audioInterface.setLiveMidiPitchBend(trackId, event.normalizedValue ?? 0);
      } else if (event.kind === 'vibrato' && settings) {
        audioInterface.setLiveMidiVibrato(
          trackId,
          event.normalizedValue ?? event.value ?? 0,
          settings.vibratoMaxSemitones ?? 0.35,
          settings.vibratoRateHz ?? 5.5,
        );
      } else if (event.kind === 'expression') {
        audioInterface.setLiveMidiExpression(trackId, event.normalizedValue ?? event.value ?? 1);
      } else if (event.kind === 'sustain') {
        audioInterface.setLiveMidiSustain(trackId, (event.value ?? 0) >= 0.5);
      }
      // Articulation events intentionally remain semantic in LP3.
      // LP4 adapters decide how they map to keyswitches, CCs or backend APIs.
    }
  }

  private latchTrackIdForPitch(pitch: number, trackId: string): void {
    const latchedTracks = this.liveNoteTrackOwnership.get(pitch) ?? [];
    latchedTracks.push(trackId);
    this.liveNoteTrackOwnership.set(pitch, latchedTracks);
  }

  private applyPerformanceProfile(
    profileId: string,
    settingsOverride: { bendRangeSemitones?: number; vibratoSmoothingMs?: number } = {},
  ): void {
    const existingTrackId = this.guitarPerformanceTrackId;
    if (existingTrackId) {
      KGAudioInterface.instance().releaseAllLiveMidi(existingTrackId);
    }
    this.externalMidiAdapter.panic();

    this.liveNoteTrackOwnership.clear();
    this.guitarPerformanceTrackId = null;
    this.performanceProfileId = profileId;

    if (profileId === 'off') {
      this.guitarPerformanceEngine = null;
      this.notifyStateChange();
      return;
    }

    const profile = getGuitarPerformanceProfile(profileId);
    if (!profile) {
      this.performanceProfileId = 'off';
      this.guitarPerformanceEngine = null;
      this.notifyStateChange();
      return;
    }

    this.guitarPerformanceEngine = new GuitarPerformanceEngine(profile, settingsOverride);
    this.notifyStateChange();
  }

  private refreshExternalMidiAdapter(): void {
    const output = this.selectedOutputId
      ? this.midiAccess?.outputs.get(this.selectedOutputId) ?? null
      : null;
    const bendRange = this.guitarPerformanceEngine?.getSettings().bendRangeSemitones
      ?? Number(ConfigManager.instance().get('performance.guitar_bend_range_semitones') ?? 2);

    this.externalMidiAdapter.configure({
      output,
      channel: this.externalMidiChannel,
      bendRangeSemitones: bendRange,
      articulationMap: DEFAULT_GUITAR_ARTICULATION_MIDI_MAP,
    });

    if (this.instrumentBackendId === 'external-midi') {
      this.externalMidiAdapter.activate();
    } else {
      this.externalMidiAdapter.deactivate();
    }
  }

  private getSelectedMidiTrack(): KGMidiTrack | null {
    const { selectedTrackId, tracks } = useProjectStore.getState();
    if (!selectedTrackId) return null;
    const selectedTrack = tracks.find((track) => track.getId().toString() === selectedTrackId);
    return selectedTrack instanceof KGMidiTrack ? selectedTrack : null;
  }

  private getSelectedMidiTrackId(): string | null {
    const track = this.getSelectedMidiTrack();
    if (!track) {
      console.log('No MIDI track selected - MIDI input ignored');
      return null;
    }
    return track.getId().toString();
  }

  private consumeLatchedTrackIdForPitch(pitch: number): string | null {
    const latchedTracks = this.liveNoteTrackOwnership.get(pitch);
    if (!latchedTracks || latchedTracks.length === 0) {
      return null;
    }

    const trackId = latchedTracks.pop() ?? null;
    if (latchedTracks.length === 0) {
      this.liveNoteTrackOwnership.delete(pitch);
    } else {
      this.liveNoteTrackOwnership.set(pitch, latchedTracks);
    }

    return trackId;
  }

  private normalizeSustainPedalValue(value: number): boolean {
    const rawPressed = value >= KGMidiInput.SUSTAIN_ON_THRESHOLD;

    if (this.sustainPolarityInverted === null) {
      // Assume the pedal starts released. The first observed sustain CC therefore
      // represents a press-down gesture and reveals whether the device is inverted.
      this.sustainPolarityInverted = !rawPressed;
    }

    return this.sustainPolarityInverted ? !rawPressed : rawPressed;
  }

  private emitLiveNoteActivity(event: LiveMidiNoteActivityEvent): void {
    for (const listener of this.liveNoteActivityListeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors to avoid disrupting MIDI handling.
      }
    }
  }

  /**
   * Clean up MIDI resources
   */
  public async dispose(): Promise<void> {
    try {
      // Disconnect from all inputs
      this.connectedInputs.forEach((input, inputId) => {
        this.disconnectFromInput(inputId);
      });
      this.connectedInputs.clear();

      // Clear MIDI access
      if (this.midiAccess) {
        this.midiAccess.onstatechange = null;
        this.midiAccess = null;
      }

      this.isInitialized = false;
      this.liveNoteTrackOwnership.clear();
      this.sustainPolarityInverted = null;
      this.liveNoteActivityListeners = [];
      this.liveMidiMessageListeners.clear();
      this.performanceEventListeners.clear();
      this.stateListeners.clear();
      this.selectedInputId = null;
      this.channelFilter = null;
      this.midiLearnListener = null;
      this.midiLearnArmed = false;
      this.retrospectiveBuffer = [];
      if (this.guitarPerformanceTrackId) {
        KGAudioInterface.instance().releaseAllLiveMidi(this.guitarPerformanceTrackId);
      }
      this.externalMidiAdapter.deactivate();
      this.guitarPerformanceEngine?.reset();
      this.guitarPerformanceEngine = null;
      this.performanceProfileId = 'off';
      this.instrumentBackendId = 'internal-sampler';
      this.selectedOutputId = '';
      this.externalMidiChannel = 0;
      this.guitarPerformanceTrackId = null;
      this.notifyStateChange();

      console.log("MIDI resources disposed successfully");
    } catch (error) {
      console.error("Error disposing MIDI resources:", error);
    }
  }

  // ===== RECORDING =====

  public setRecordingCallbacks(
    onNoteOn: ((pitch: number, velocity: number) => void) | null,
    onNoteOff: ((pitch: number) => void) | null,
    onPitchBend: ((value: number) => void) | null = null,
    onControlChange: ((controller: number, value: number) => void) | null = null,
    onPressure: ((kind: 'channel' | 'poly', note: number | null, value: number) => void) | null = null
  ): void {
    this.onRecordNoteOn = onNoteOn;
    this.onRecordNoteOff = onNoteOff;
    this.onRecordPitchBend = onPitchBend;
    this.onRecordControlChange = onControlChange;
    this.onRecordPressure = onPressure;
  }

  public addLiveNoteActivityListener(listener: LiveNoteActivityListener): void {
    this.liveNoteActivityListeners.push(listener);
  }

  public removeLiveNoteActivityListener(listener: LiveNoteActivityListener): void {
    this.liveNoteActivityListeners = this.liveNoteActivityListeners.filter(current => current !== listener);
  }

  public addLiveMidiMessageListener(listener: LiveMidiMessageListener): void {
    this.liveMidiMessageListeners.add(listener);
  }

  public removeLiveMidiMessageListener(listener: LiveMidiMessageListener): void {
    this.liveMidiMessageListeners.delete(listener);
  }

  public addPerformanceEventListener(listener: PerformanceEventListener): void {
    this.performanceEventListeners.add(listener);
  }

  public removePerformanceEventListener(listener: PerformanceEventListener): void {
    this.performanceEventListeners.delete(listener);
  }

  public subscribeState(listener: MidiStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public selectInput(inputId: string | null): void {
    if (inputId !== null && !this.connectedInputs.has(inputId)) {
      throw new Error(`Unknown MIDI input: ${inputId}`);
    }
    this.selectedInputId = inputId;
    this.sustainPolarityInverted = null;
    this.notifyStateChange();
  }

  public setChannelFilter(channel: number | null): void {
    if (channel !== null && (!Number.isInteger(channel) || channel < 0 || channel > 15)) {
      throw new Error('MIDI channel must be null (Omni) or an integer from 0 to 15');
    }
    this.channelFilter = channel;
    this.notifyStateChange();
  }

  public beginMidiLearn(listener: (result: MidiLearnResult) => void): void {
    this.midiLearnListener = listener;
    this.midiLearnArmed = true;
    this.notifyStateChange();
  }

  public cancelMidiLearn(): void {
    this.midiLearnListener = null;
    this.midiLearnArmed = false;
    this.notifyStateChange();
  }

  // ===== GETTERS =====

  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  public getMIDIAccess(): MIDIAccess | null {
    return this.midiAccess;
  }

  public getConnectedInputs(): MIDIInput[] {
    return Array.from(this.connectedInputs.values());
  }

  public getConnectedInputCount(): number {
    return this.connectedInputs.size;
  }

  public getConnectedInputDescriptors(): MidiInputDescriptor[] {
    return Array.from(this.connectedInputs.values()).map((input) => ({
      id: input.id,
      name: input.name || 'MIDI Input',
      manufacturer: input.manufacturer || '',
      state: input.state,
    }));
  }

  public getSelectedInputId(): string | null {
    return this.selectedInputId;
  }

  public getChannelFilter(): number | null {
    return this.channelFilter;
  }

  public getMidiLearnArmed(): boolean {
    return this.midiLearnArmed;
  }

  public getPerformanceProfileId(): string {
    return this.performanceProfileId;
  }

  public getTonePresets(): PerformancePreset[] {
    return GILMOUR_INSPIRED_PRESETS.map(preset => ({
      ...preset,
      mappings: preset.mappings.map(mapping => ({ ...mapping })),
      articulationIds: [...preset.articulationIds],
      signalChain: preset.signalChain.map(block => ({ ...block, parameters: { ...block.parameters } })),
      backendRequirements: preset.backendRequirements
        ? {
            ...preset.backendRequirements,
            preferredBackends: preset.backendRequirements.preferredBackends
              ? [...preset.backendRequirements.preferredBackends]
              : undefined,
            requiredCapabilities: preset.backendRequirements.requiredCapabilities
              ? [...preset.backendRequirements.requiredCapabilities]
              : undefined,
          }
        : undefined,
      metadata: preset.metadata ? { ...preset.metadata } : undefined,
    }));
  }

  public getSelectedTonePresetId(): string {
    return this.getSelectedMidiTrack()?.getTonePresetId() ?? 'off';
  }

  public getSelectedToneSignalChain(): SignalChainBlock[] {
    return this.getSelectedMidiTrack()?.getToneSignalChain() ?? [];
  }

  public setTonePreset(presetId: string): void {
    const track = this.getSelectedMidiTrack();
    if (!track) return;

    const audio = KGAudioInterface.instance();
    if (presetId === 'off') {
      track.setTonePresetId('off');
      track.setToneSignalChain([]);
      audio.applyTrackToneSignalChain(track.getId().toString(), []);
    } else {
      const preset = getPerformancePreset(presetId);
      if (!preset) return;
      const chain = preset.signalChain.map(block => ({ ...block, parameters: { ...block.parameters } }));
      track.setTonePresetId(preset.id);
      track.setToneSignalChain(chain);
      audio.applyTrackToneSignalChain(track.getId().toString(), chain);

      if (preset.instrumentProfileId && preset.instrumentProfileId !== this.performanceProfileId) {
        this.setPerformanceProfile(preset.instrumentProfileId);
      }
    }

    void useProjectStore.getState().updateTrack(track);
    this.notifyStateChange();
  }

  public setToneBlockEnabled(blockId: string, enabled: boolean): void {
    const track = this.getSelectedMidiTrack();
    if (!track) return;
    const chain = track.getToneSignalChain();
    const block = chain.find(candidate => candidate.id === blockId);
    if (!block) return;
    block.enabled = enabled;
    track.setToneSignalChain(chain);
    KGAudioInterface.instance().setTrackToneBlockEnabled(track.getId().toString(), blockId, enabled);
    void useProjectStore.getState().updateTrack(track);
    this.notifyStateChange();
  }

  public setToneBlockParameter(
    blockId: string,
    parameterId: string,
    value: number | string | boolean,
  ): void {
    const track = this.getSelectedMidiTrack();
    if (!track) return;
    const chain = track.getToneSignalChain();
    const block = chain.find(candidate => candidate.id === blockId);
    if (!block) return;
    block.parameters[parameterId] = value;
    track.setToneSignalChain(chain);
    KGAudioInterface.instance().setTrackToneBlockParameter(
      track.getId().toString(),
      blockId,
      parameterId,
      value,
    );
    void useProjectStore.getState().updateTrack(track);
    this.notifyStateChange();
  }

  public automateToneBlockParameter(
    blockId: string,
    parameterId: string,
    value: number,
    time?: number,
  ): boolean {
    const track = this.getSelectedMidiTrack();
    if (!track) return false;
    return KGAudioInterface.instance().automateTrackToneBlockParameter(
      track.getId().toString(),
      blockId,
      parameterId,
      value,
      time,
    );
  }

  public getInstrumentBackendId(): 'internal-sampler' | 'external-midi' {
    return this.instrumentBackendId;
  }

  public getInstrumentBackendDescriptors(): InstrumentAdapterDescriptor[] {
    return getInstrumentBackendDescriptors(this.midiAccess?.outputs.size ?? 0);
  }

  public getConnectedOutputDescriptors(): MidiOutputDescriptor[] {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.outputs.values()).map(output => ({
      id: output.id,
      name: output.name || 'MIDI Output',
      manufacturer: output.manufacturer || '',
      state: output.state,
    }));
  }

  public getSelectedOutputId(): string {
    return this.selectedOutputId;
  }

  public getExternalMidiChannel(): number {
    return this.externalMidiChannel;
  }

  public getExternalMidiReady(): boolean {
    return this.externalMidiAdapter.isReady();
  }

  public setInstrumentBackend(backendId: string): void {
    const next = backendId === 'external-midi' ? 'external-midi' : 'internal-sampler';
    if (next === this.instrumentBackendId) {
      this.refreshExternalMidiAdapter();
      return;
    }

    if (this.guitarPerformanceTrackId) {
      KGAudioInterface.instance().releaseAllLiveMidi(this.guitarPerformanceTrackId);
      this.guitarPerformanceTrackId = null;
    }
    this.externalMidiAdapter.panic();
    this.instrumentBackendId = next;
    this.refreshExternalMidiAdapter();

    const config = ConfigManager.instance();
    if (config.getIsInitialized()) {
      void config.set('performance.instrument_backend_id', next);
    }
    this.notifyStateChange();
  }

  public selectOutput(outputId: string | null): void {
    const nextId = outputId ?? '';
    if (nextId && this.midiAccess && !this.midiAccess.outputs.has(nextId)) {
      throw new Error(`Unknown MIDI output: ${nextId}`);
    }

    this.externalMidiAdapter.panic();
    this.selectedOutputId = nextId;
    this.refreshExternalMidiAdapter();

    const config = ConfigManager.instance();
    if (config.getIsInitialized()) {
      void config.set('performance.external_midi_output_id', nextId);
    }
    this.notifyStateChange();
  }

  public setExternalMidiChannel(channel: number): void {
    const next = Math.max(0, Math.min(15, Math.round(channel)));
    this.externalMidiAdapter.panic();
    this.externalMidiChannel = next;
    this.refreshExternalMidiAdapter();

    const config = ConfigManager.instance();
    if (config.getIsInitialized()) {
      void config.set('performance.external_midi_channel', next);
    }
    this.notifyStateChange();
  }

  public getPerformanceProfiles(): PerformanceProfile[] {
    return GUITAR_PERFORMANCE_PROFILES.map(profile => ({
      ...profile,
      mappings: profile.mappings.map(mapping => ({ ...mapping })),
      articulations: profile.articulations.map(articulation => ({ ...articulation })),
      guitar: profile.guitar ? { ...profile.guitar } : undefined,
    }));
  }

  public getGuitarPerformanceSnapshot(): GuitarPerformanceSnapshot | null {
    return this.guitarPerformanceEngine?.getSnapshot() ?? null;
  }

  public getGuitarPerformanceSettings() {
    return this.guitarPerformanceEngine?.getSettings() ?? null;
  }

  public setPerformanceProfile(profileId: string): void {
    const config = ConfigManager.instance();
    this.applyPerformanceProfile(profileId);

    if (config.getIsInitialized()) {
      const settings = this.guitarPerformanceEngine?.getSettings();
      void config.set('performance.profile_id', this.performanceProfileId);
      if (settings) {
        void config.set('performance.guitar_bend_range_semitones', settings.bendRangeSemitones);
        void config.set('performance.guitar_vibrato_smoothing_ms', settings.vibratoSmoothingMs);
      }
    }
  }

  public setGuitarBendRangeSemitones(semitones: number): void {
    const value = Math.max(1, Math.min(12, Math.round(semitones)));
    this.guitarPerformanceEngine?.setSettings({ bendRangeSemitones: value });
    this.externalMidiAdapter.configure({ bendRangeSemitones: value });

    const trackId = this.guitarPerformanceTrackId ?? this.getSelectedMidiTrackId();
    if (trackId) {
      KGAudioInterface.instance().setLiveMidiPitchBendRange(trackId, value);
    }

    const config = ConfigManager.instance();
    if (config.getIsInitialized()) {
      void config.set('performance.guitar_bend_range_semitones', value);
    }
    this.notifyStateChange();
  }

  public setGuitarVibratoSmoothingMs(smoothingMs: number): void {
    const value = Math.max(0, Math.min(500, Math.round(smoothingMs)));
    this.guitarPerformanceEngine?.setSettings({ vibratoSmoothingMs: value });

    const config = ConfigManager.instance();
    if (config.getIsInitialized()) {
      void config.set('performance.guitar_vibrato_smoothing_ms', value);
    }
    this.notifyStateChange();
  }

  public setRetrospectiveDurationSeconds(durationSeconds: number): void {
    this.retrospectiveDurationSeconds = Math.max(1, Math.min(120, Math.round(durationSeconds)));
    const latestTimestamp = this.retrospectiveBuffer[this.retrospectiveBuffer.length - 1]?.timestampMs;
    if (latestTimestamp !== undefined) {
      this.pruneRetrospectiveBuffer(latestTimestamp);
    }
    this.notifyStateChange();
  }

  public getRetrospectiveDurationSeconds(): number {
    return this.retrospectiveDurationSeconds;
  }

  public getRetrospectiveMessages(durationSeconds: number = this.retrospectiveDurationSeconds): LiveMidiMessage[] {
    if (this.retrospectiveBuffer.length === 0) {
      return [];
    }

    const safeDuration = Math.max(1, Math.min(this.retrospectiveDurationSeconds, durationSeconds));
    const latestTimestamp = this.retrospectiveBuffer[this.retrospectiveBuffer.length - 1].timestampMs;
    const cutoff = latestTimestamp - (safeDuration * 1000);
    return this.retrospectiveBuffer
      .filter(message => message.timestampMs >= cutoff)
      .filter(message => {
        if (
          (message.kind === 'note-on' || message.kind === 'note-off')
          && message.note !== undefined
          && this.guitarPerformanceEngine?.isKeyswitchNote(message.note)
        ) {
          return false;
        }
        return true;
      })
      .map(message => ({ ...message }));
  }

  public clearRetrospectiveBuffer(): void {
    this.retrospectiveBuffer = [];
    this.notifyStateChange();
  }

  public getRetrospectiveMessageCount(): number {
    return this.retrospectiveBuffer.length;
  }

  public getStateVersion(): number {
    return this.stateVersion;
  }

  public getIsWebMidiSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }
}
