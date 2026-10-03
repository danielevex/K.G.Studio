import React, { useEffect, useMemo, useState } from 'react';
import { FaChevronDown, FaChevronUp, FaKeyboard, FaLink, FaUnlink } from 'react-icons/fa';
import './LiveMidiPanel.css';
import {
  KGMidiInput,
  type MidiLearnResult,
} from '../core/midi-input/KGMidiInput';
import type { LiveMidiMessage } from '../core/performance/LivePerformanceTypes';
import { useProjectStore } from '../stores/projectStore';

function noteName(note?: number): string {
  if (note === undefined) return '—';
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return `${names[note % 12]}${octave}`;
}

function formatMessage(message: LiveMidiMessage | null): string {
  if (!message) return 'Waiting for MIDI…';
  const ch = message.channel + 1;
  switch (message.kind) {
    case 'note-on':
      return `Note On · ${noteName(message.note)} · vel ${message.velocity ?? 0} · ch ${ch}`;
    case 'note-off':
      return `Note Off · ${noteName(message.note)} · ch ${ch}`;
    case 'control-change':
      return `CC${message.controller ?? 0} · ${message.value ?? 0} · ch ${ch}`;
    case 'pitch-bend':
      return `Pitch Bend · ${((message.normalizedValue ?? 0) * 100).toFixed(0)}% · ch ${ch}`;
    case 'channel-pressure':
      return `Aftertouch · ${message.value ?? 0} · ch ${ch}`;
    case 'poly-aftertouch':
      return `Poly Aftertouch · ${noteName(message.note)} · ${message.value ?? 0} · ch ${ch}`;
    case 'program-change':
      return `Program ${message.value ?? 0} · ch ${ch}`;
    default:
      return `${message.kind} · ch ${ch}`;
  }
}

function formatLearnResult(result: MidiLearnResult | null): string {
  if (!result) return 'No control learned yet';
  const ch = result.channel + 1;
  if (result.kind === 'cc') return `CC${result.controller} · channel ${ch}`;
  if (result.kind === 'note') return `Key ${noteName(result.note)} · channel ${ch}`;
  if (result.kind === 'poly-aftertouch') return `Poly aftertouch ${noteName(result.note)} · channel ${ch}`;
  if (result.kind === 'channel-aftertouch') return `Channel aftertouch · channel ${ch}`;
  return `Pitch wheel · channel ${ch}`;
}

const LiveMidiPanel: React.FC = () => {
  const midi = useMemo(() => KGMidiInput.instance(), []);
  const [expanded, setExpanded] = useState(false);
  const [, setRevision] = useState(0);
  const [lastMessage, setLastMessage] = useState<LiveMidiMessage | null>(null);
  const [learnedControl, setLearnedControl] = useState<MidiLearnResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeRegionId = useProjectStore(state => state.activeRegionId);
  const captureLastPerformance = useProjectStore(state => state.captureLastPerformance);
  const currentStatus = useProjectStore(state => state.currentStatus);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    void midi.initialize();
    const unsubscribe = midi.subscribeState(() => setRevision((value) => value + 1));
    const onMessage = (message: LiveMidiMessage) => setLastMessage(message);
    midi.addLiveMidiMessageListener(onMessage);
    return () => {
      unsubscribe();
      midi.removeLiveMidiMessageListener(onMessage);
      midi.cancelMidiLearn();
    };
  }, [midi]);

  const inputs = midi.getConnectedInputDescriptors();
  const selectedInputId = midi.getSelectedInputId();
  const channelFilter = midi.getChannelFilter();
  const midiLearnArmed = midi.getMidiLearnArmed();
  const performanceProfileId = midi.getPerformanceProfileId();
  const performanceProfiles = midi.getPerformanceProfiles();
  const performanceSnapshot = midi.getGuitarPerformanceSnapshot();
  const performanceSettings = midi.getGuitarPerformanceSettings();
  const instrumentBackendId = midi.getInstrumentBackendId();
  const backendDescriptors = midi.getInstrumentBackendDescriptors();
  const outputs = midi.getConnectedOutputDescriptors();
  const selectedOutputId = midi.getSelectedOutputId();
  const externalMidiChannel = midi.getExternalMidiChannel();
  const externalMidiReady = midi.getExternalMidiReady();
  const hasAccess = midi.getMIDIAccess() !== null;
  const supported = midi.getIsWebMidiSupported();

  const handleEnableMidi = async () => {
    setError(null);
    try {
      await midi.requestMIDIAccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const handleCaptureLastPerformance = async () => {
    if (!activeRegionId || capturing) return;
    setCapturing(true);
    try {
      await captureLastPerformance(30);
    } finally {
      setCapturing(false);
    }
  };

  const handleMidiLearn = () => {
    if (midiLearnArmed) {
      midi.cancelMidiLearn();
      return;
    }
    setLearnedControl(null);
    midi.beginMidiLearn((result) => {
      setLearnedControl(result);
    });
  };

  return (
    <div className={`live-midi-shell${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="live-midi-launcher"
        onClick={() => setExpanded((value) => !value)}
        title="Live MIDI"
        aria-expanded={expanded}
      >
        <span className={`live-midi-dot ${hasAccess && inputs.length > 0 ? 'connected' : ''}`} />
        <FaKeyboard />
        <span>MIDI</span>
        {expanded ? <FaChevronDown /> : <FaChevronUp />}
      </button>

      {expanded && (
        <div className="live-midi-panel" role="dialog" aria-label="Live MIDI">
          <div className="live-midi-panel-header">
            <div>
              <strong>Live MIDI</strong>
              <span>{inputs.length} input{inputs.length === 1 ? '' : 's'}</span>
            </div>
            <span className={`live-midi-status ${hasAccess && inputs.length > 0 ? 'online' : ''}`}>
              {hasAccess && inputs.length > 0 ? 'READY' : 'OFFLINE'}
            </span>
          </div>

          {!supported && (
            <div className="live-midi-warning">
              Web MIDI is not supported by this browser.
            </div>
          )}

          {supported && !hasAccess && (
            <button type="button" className="live-midi-primary" onClick={handleEnableMidi}>
              <FaLink /> Enable MIDI
            </button>
          )}

          {supported && hasAccess && (
            <>
              <label className="live-midi-field">
                <span>Input device</span>
                <select
                  value={selectedInputId ?? ''}
                  onChange={(event) => midi.selectInput(event.target.value || null)}
                >
                  <option value="">All MIDI inputs</option>
                  {inputs.map((input) => (
                    <option key={input.id} value={input.id}>
                      {input.name}{input.manufacturer ? ` — ${input.manufacturer}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="live-midi-field">
                <span>Channel</span>
                <select
                  value={channelFilter === null ? 'omni' : String(channelFilter)}
                  onChange={(event) => {
                    midi.setChannelFilter(event.target.value === 'omni' ? null : Number(event.target.value));
                  }}
                >
                  <option value="omni">Omni</option>
                  {Array.from({ length: 16 }, (_, index) => (
                    <option key={index} value={index}>Channel {index + 1}</option>
                  ))}
                </select>
              </label>

              <div className="live-midi-monitor">
                <span className="live-midi-monitor-label">MONITOR</span>
                <strong>{formatMessage(lastMessage)}</strong>
                <small>
                  Device: {lastMessage
                    ? inputs.find((input) => input.id === lastMessage.deviceId)?.name ?? lastMessage.deviceId
                    : '—'}
                </small>
              </div>

              <div className="live-midi-performance">
                <label className="live-midi-field">
                  <span>Performance</span>
                  <select
                    value={performanceProfileId}
                    onChange={(event) => midi.setPerformanceProfile(event.target.value)}
                  >
                    <option value="off">Standard MIDI</option>
                    {performanceProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </label>

                {performanceProfileId !== 'off' && performanceSettings && (
                  <>
                    <label className="live-midi-field">
                      <span>Backend</span>
                      <select
                        value={instrumentBackendId}
                        onChange={(event) => midi.setInstrumentBackend(event.target.value)}
                      >
                        {backendDescriptors.map((backend) => (
                          <option key={backend.id} value={backend.id}>
                            {backend.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {instrumentBackendId === 'external-midi' && (
                      <div className="live-midi-backend-config">
                        <label className="live-midi-field">
                          <span>MIDI out</span>
                          <select
                            value={selectedOutputId}
                            onChange={(event) => midi.selectOutput(event.target.value || null)}
                          >
                            <option value="">Select output…</option>
                            {outputs.map((output) => (
                              <option key={output.id} value={output.id}>
                                {output.name}{output.manufacturer ? ` — ${output.manufacturer}` : ''}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="live-midi-field">
                          <span>Out channel</span>
                          <select
                            value={String(externalMidiChannel)}
                            onChange={(event) => midi.setExternalMidiChannel(Number(event.target.value))}
                          >
                            {Array.from({ length: 16 }, (_, index) => (
                              <option key={index} value={index}>Channel {index + 1}</option>
                            ))}
                          </select>
                        </label>

                        <div className={`live-midi-backend-health ${externalMidiReady ? 'ready' : 'needs-config'}`}>
                          <strong>{externalMidiReady ? 'EXTERNAL BACKEND READY' : 'SELECT A MIDI OUTPUT'}</strong>
                          <small>
                            Routes LP3 gestures to a DAW, Kontakt, sfizz VST3 or another MIDI instrument.
                          </small>
                        </div>
                      </div>
                    )}

                    <label className="live-midi-field">
                      <span>Bend range</span>
                      <select
                        value={String(performanceSettings.bendRangeSemitones)}
                        onChange={(event) => midi.setGuitarBendRangeSemitones(Number(event.target.value))}
                      >
                        {[1, 2, 3, 4, 7, 12].map((value) => (
                          <option key={value} value={value}>±{value} semitone{value === 1 ? '' : 's'}</option>
                        ))}
                      </select>
                    </label>

                    <div className="live-midi-performance-status">
                      <div>
                        <span>MODE</span>
                        <strong>{performanceSnapshot?.mode === 'mono-lead' ? 'MONO LEAD' : 'POLY'}</strong>
                      </div>
                      <div>
                        <span>NOTE</span>
                        <strong>{performanceSnapshot?.activeNote ?? '—'}</strong>
                      </div>
                      <div>
                        <span>GESTURE</span>
                        <strong>{performanceSnapshot?.lastTransition ?? '—'}</strong>
                      </div>
                      <div>
                        <span>ARTICULATION</span>
                        <strong>{performanceSnapshot?.activeArticulationId ?? '—'}</strong>
                      </div>
                      <div>
                        <span>BEND</span>
                        <strong>{(performanceSnapshot?.bendSemitones ?? 0).toFixed(2)} st</strong>
                      </div>
                      <div>
                        <span>VIBRATO</span>
                        <strong>{Math.round((performanceSnapshot?.vibrato ?? 0) * 100)}%</strong>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="live-midi-capture">
                <button
                  type="button"
                  className="live-midi-capture-button"
                  onClick={() => { void handleCaptureLastPerformance(); }}
                  disabled={!activeRegionId || capturing || midi.getRetrospectiveMessageCount() === 0}
                  title={activeRegionId ? 'Capture recent MIDI into the active region' : 'Open a MIDI region first'}
                >
                  {capturing ? 'Capturing…' : 'Capture Last 30s'}
                </button>
                <small>
                  {activeRegionId
                    ? `${midi.getRetrospectiveMessageCount()} recent MIDI messages buffered`
                    : 'Open a MIDI region to use retrospective capture'}
                </small>
              </div>

              <div className="live-midi-learn">
                <button
                  type="button"
                  className={midiLearnArmed ? 'learning' : ''}
                  onClick={handleMidiLearn}
                >
                  {midiLearnArmed ? <FaUnlink /> : <FaLink />}
                  {midiLearnArmed ? 'Cancel Learn' : 'MIDI Learn'}
                </button>
                <div>
                  <strong>{midiLearnArmed ? 'Move a controller or press a key…' : formatLearnResult(learnedControl)}</strong>
                  <small>Used later for bend, vibrato, expression and articulations.</small>
                </div>
              </div>
            </>
          )}

          {error && <div className="live-midi-error">{error}</div>}
          {currentStatus.startsWith('Captured ') && (
            <div className="live-midi-capture-status">{currentStatus}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveMidiPanel;
