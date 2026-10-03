import { vi } from 'vitest';

/**
 * Mock implementation of Tone.js for testing
 * This provides consistent, deterministic behavior for audio-related tests
 */

// Mock Sampler class
export const MockSampler = vi.fn().mockImplementation(() => ({
  triggerAttackRelease: vi.fn(),
  triggerAttack: vi.fn(),
  triggerRelease: vi.fn(),
  releaseAll: vi.fn(),
  dispose: vi.fn(),
  loaded: true,
  attack: 0,
  release: 0.1,
  curve: 'exponential',
  output: {},
  volume: {
    value: -12
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  toDestination: vi.fn()
}));

export const MockBufferSource = vi.fn().mockImplementation((options?: { playbackRate?: number }) => {
  const instance = {
    playbackRate: {
      value: options?.playbackRate ?? 1,
      setValueAtTime: vi.fn(),
    },
    connect: vi.fn(() => instance),
    start: vi.fn(() => instance),
    stop: vi.fn(() => instance),
    onended: undefined as (() => void) | undefined,
  };
  return instance;
});

// Mock Transport object
export const MockTransport = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  position: 0,
  bpm: {
    value: 120,
    rampTo: vi.fn()
  },
  timeSignature: [4, 4],
  state: 'stopped',
  scheduleOnce: vi.fn(),
  scheduleRepeat: vi.fn(),
  schedule: vi.fn().mockReturnValue(1),
  cancel: vi.fn(),
  clear: vi.fn()
  ,
  setLoopPoints: vi.fn(),
  loop: false,
  PPQ: 192,
  getTicksAtTime: vi.fn().mockImplementation((time: number) => time * 192)
};

export const MockLoop = vi.fn().mockImplementation((callback: (time: number) => void, interval: string) => ({
  callback,
  interval,
  start: vi.fn(),
  dispose: vi.fn()
}));

// Mock Destination
export const MockDestination = {
  volume: {
    value: -12
  },
  mute: false,
  connect: vi.fn(),
  disconnect: vi.fn()
};

// Mock ToneAudioBuffer
export const MockToneAudioBuffer = vi.fn().mockImplementation(() => ({
  loaded: true,
  dispose: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined)
}));

// Mock Gain node
export const MockGain = vi.fn().mockImplementation((initialValue: number = 1) => ({
  gain: {
    value: initialValue,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn()
}));

// Mock Panner node
export const MockPanner = vi.fn().mockImplementation((initialValue: number = 0) => ({
  pan: {
    value: initialValue,
    setValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn(),
  toDestination: vi.fn(),
}));

// Mock Meter
export const MockMeter = vi.fn().mockImplementation(() => ({
  getValue: vi.fn().mockReturnValue(-Infinity),
  connect: vi.fn(),
  disconnect: vi.fn(),
  dispose: vi.fn()
}));


const createMockParam = (value: number) => ({
  value,
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

const createMockEffectNode = () => {
  const node = {
    connect: vi.fn(() => node),
    disconnect: vi.fn(),
    dispose: vi.fn(),
  };
  return node;
};

export const MockCompressor = vi.fn().mockImplementation((options?: {
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
}) => ({
  ...createMockEffectNode(),
  threshold: createMockParam(options?.threshold ?? -24),
  ratio: createMockParam(options?.ratio ?? 4),
  attack: createMockParam(options?.attack ?? 0.01),
  release: createMockParam(options?.release ?? 0.1),
}));

export const MockDistortion = vi.fn().mockImplementation((amount: number = 0.4) => ({
  ...createMockEffectNode(),
  distortion: amount,
  wet: createMockParam(1),
}));

export const MockFilter = vi.fn().mockImplementation((frequency: number = 350, type: string = 'lowpass') => ({
  ...createMockEffectNode(),
  frequency: createMockParam(frequency),
  type,
}));

export const MockEQ3 = vi.fn().mockImplementation((low: number = 0, mid: number = 0, high: number = 0) => ({
  ...createMockEffectNode(),
  low: createMockParam(low),
  mid: createMockParam(mid),
  high: createMockParam(high),
}));

export const MockChorus = vi.fn().mockImplementation((options?: {
  frequency?: number;
  delayTime?: number;
  depth?: number;
  wet?: number;
}) => {
  const node = {
    ...createMockEffectNode(),
    frequency: createMockParam(options?.frequency ?? 1.5),
    delayTime: options?.delayTime ?? 3.5,
    depth: options?.depth ?? 0.7,
    wet: createMockParam(options?.wet ?? 0.5),
    start: vi.fn(),
  };
  node.start.mockReturnValue(node);
  return node;
});

export const MockFeedbackDelay = vi.fn().mockImplementation((delayTime: number = 0.25, feedback: number = 0.125) => ({
  ...createMockEffectNode(),
  delayTime: createMockParam(delayTime),
  feedback: createMockParam(feedback),
  wet: createMockParam(1),
}));

export const MockReverb = vi.fn().mockImplementation((decay: number = 1.5) => ({
  ...createMockEffectNode(),
  decay,
  wet: createMockParam(1),
}));

// Complete Tone.js mock
export const ToneMock = {
  Sampler: MockSampler,
  BufferSource: MockBufferSource,
  ToneBufferSource: MockBufferSource,
  Loop: MockLoop,
  Transport: MockTransport,
  Destination: MockDestination,
  ToneAudioBuffer: MockToneAudioBuffer,
  Gain: MockGain,
  Panner: MockPanner,
  Meter: MockMeter,
  Compressor: MockCompressor,
  Distortion: MockDistortion,
  Filter: MockFilter,
  EQ3: MockEQ3,
  Chorus: MockChorus,
  FeedbackDelay: MockFeedbackDelay,
  Reverb: MockReverb,
  
  // Context management
  start: vi.fn().mockResolvedValue(undefined),
  getContext: vi.fn().mockReturnValue({
    state: 'running',
    resume: vi.fn().mockResolvedValue(undefined),
    suspend: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    lookAhead: 0.05,
    setTimeout: vi.fn().mockImplementation((fn: () => void, timeoutSeconds: number) => {
      return window.setTimeout(fn, timeoutSeconds * 1000);
    }),
    clearTimeout: vi.fn().mockImplementation((id: number) => {
      window.clearTimeout(id);
    })
  }),
  
  // Time utilities
  Time: vi.fn().mockImplementation((time) => ({
    toSeconds: vi.fn().mockReturnValue(parseFloat(time) || 0),
    valueOf: vi.fn().mockReturnValue(parseFloat(time) || 0)
  })),
  
  // Frequency utilities
  Frequency: vi.fn().mockImplementation((freq) => ({
    toFrequency: vi.fn().mockReturnValue(parseFloat(freq) || 440),
    valueOf: vi.fn().mockReturnValue(parseFloat(freq) || 440)
  })),
  now: vi.fn().mockImplementation(() => Date.now() / 1000)
};

// Setup the global mock
export const setupToneMocks = () => {
  vi.doMock('tone', () => ToneMock);
};
