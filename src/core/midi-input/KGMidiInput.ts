import { KGAudioInterface } from '../audio-interface/KGAudioInterface';
import { useProjectStore } from '../../stores/projectStore';
import { KGMidiTrack } from '../track/KGMidiTrack';
import type { LiveMidiMessage } from '../performance/LivePerformanceTypes';

export interface LiveMidiNoteActivityEvent {
  pitch: number;
  isNoteOn: boolean;
}

type LiveNoteActivityListener = (...args: [LiveMidiNoteActivityEvent]) => void;
type LiveMidiMessageListener = (...args: [LiveMidiMessage]) => void;
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
  private midiLearnListener: ((result: MidiLearnResult) => void) | null = null;
  private midiLearnArmed = false;

  // Recording callbacks
  private onRecordNoteOn: ((pitch: number, velocity: number) => void) | null = null;
  private onRecordNoteOff: ((pitch: number) => void) | null = null;
  private onRecordPitchBend: ((value: number) => void) | null = null;
  private onRecordControlChange: ((controller: number, value: number) => void) | null = null;
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

      // Connect to all existing inputs
      this.connectToAllInputs();
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

      if (port && port.type === "input") {
        if (port.state === "connected") {
          console.log(`MIDI device connected: ${port.name}`);
          this.connectToInput(port as MIDIInput);
        } else if (port.state === "disconnected") {
          console.log(`MIDI device disconnected: ${port.name}`);
          this.disconnectFromInput(port.id);
        }
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
      this.emitLiveNoteActivity({ pitch: data1, isNoteOn: true });
      this.triggerNoteOn(data1, data2);
      this.onRecordNoteOn?.(data1, data2);
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
      this.emitLiveNoteActivity({ pitch: data1, isNoteOn: false });
      this.triggerNoteOff(data1);
      this.onRecordNoteOff?.(data1);
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
      this.handleControlChange(data1, data2);
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
      this.triggerPitchBend(normalizedValue);
      this.onRecordPitchBend?.(pitchBendValue);
    }
  }

  private emitLiveMidiMessage(message: LiveMidiMessage): void {
    for (const listener of this.liveMidiMessageListeners) {
      try {
        listener(message);
      } catch {
        // Listener failures must never interrupt live MIDI processing.
      }
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
          const latchedTracks = this.liveNoteTrackOwnership.get(pitch) ?? [];
          latchedTracks.push(selectedTrackId);
          this.liveNoteTrackOwnership.set(pitch, latchedTracks);
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

  private handleControlChange(controller: number, value: number): void {
    const selectedTrackId = this.getSelectedMidiTrackId();
    if (!selectedTrackId) {
      return;
    }

    const audioInterface = KGAudioInterface.instance();
    if (!audioInterface.getIsInitialized() || !audioInterface.getIsAudioContextStarted()) {
      return;
    }

    if (controller === KGMidiInput.CONTROL_CHANGE_SUSTAIN) {
      const isPressed = this.normalizeSustainPedalValue(value);
      this.onRecordControlChange?.(controller, isPressed ? 127 : 0);
      audioInterface.setLiveMidiSustain(
        selectedTrackId,
        isPressed
      );
      return;
    }

    this.onRecordControlChange?.(controller, value);

    if (
      controller === KGMidiInput.CONTROL_CHANGE_MODULATION ||
      controller === KGMidiInput.CONTROL_CHANGE_BREATH ||
      controller === KGMidiInput.CONTROL_CHANGE_CHANNEL_VOLUME ||
      controller === KGMidiInput.CONTROL_CHANGE_EXPRESSION
    ) {
      audioInterface.setLiveMidiExpression(selectedTrackId, value / 127);
    }
  }

  private getSelectedMidiTrackId(): string | null {
    const { selectedTrackId, tracks } = useProjectStore.getState();
    if (!selectedTrackId) {
      console.log('No track selected - MIDI input ignored');
      return null;
    }

    const selectedTrack = tracks.find((track) => track.getId().toString() === selectedTrackId);
    if (!(selectedTrack instanceof KGMidiTrack)) {
      console.log(`Selected track ${selectedTrackId} is not a MIDI track - MIDI input ignored`);
      return null;
    }

    return selectedTrackId;
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
      this.stateListeners.clear();
      this.selectedInputId = null;
      this.channelFilter = null;
      this.midiLearnListener = null;
      this.midiLearnArmed = false;
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
    onControlChange: ((controller: number, value: number) => void) | null = null
  ): void {
    this.onRecordNoteOn = onNoteOn;
    this.onRecordNoteOff = onNoteOff;
    this.onRecordPitchBend = onPitchBend;
    this.onRecordControlChange = onControlChange;
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

  public getStateVersion(): number {
    return this.stateVersion;
  }

  public getIsWebMidiSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }
}
