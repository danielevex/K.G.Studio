import type { InstrumentAdapterDescriptor } from '../LivePerformanceTypes';

export const INTERNAL_SAMPLER_ADAPTER: InstrumentAdapterDescriptor = {
  id: 'internal-sampler',
  name: 'K.G.Studio Internal Sampler',
  backend: 'soundfont',
  supportsPitchBend: true,
  supportsAftertouch: false,
  supportsArticulations: false,
  supportsParameterAutomation: false,
  supportsStatePersistence: true,
  supportsTrueLegato: false,
  supportsSemanticTransitions: false,
  availability: 'ready',
  latencyMode: 'in-process',
  metadata: {
    renderer: 'Tone.js / SoundFont',
    role: 'fallback and immediate monitoring',
  },
};

export function buildExternalMidiDescriptor(outputCount: number): InstrumentAdapterDescriptor {
  return {
    id: 'external-midi',
    name: 'External MIDI / DAW',
    backend: 'external-daw',
    supportsPitchBend: true,
    supportsAftertouch: true,
    supportsArticulations: true,
    supportsParameterAutomation: false,
    supportsStatePersistence: false,
    supportsTrueLegato: true,
    supportsSemanticTransitions: true,
    availability: outputCount > 0 ? 'ready' : 'needs-configuration',
    latencyMode: 'external-midi',
    metadata: {
      protocol: 'Web MIDI',
      outputCount: String(outputCount),
      sfizzCompatible: 'via DAW/plugin host or MIDI-capable sfizz setup',
      kontaktCompatible: 'yes',
    },
  };
}

export function getInstrumentBackendDescriptors(outputCount: number): InstrumentAdapterDescriptor[] {
  return [
    INTERNAL_SAMPLER_ADAPTER,
    buildExternalMidiDescriptor(outputCount),
  ];
}
