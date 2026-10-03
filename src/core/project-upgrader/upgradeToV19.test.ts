import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

describe('upgradeToV19', () => {
  it('gives legacy MIDI tracks a safe bypassed tone state', () => {
    const project = new KGProject('Legacy V18');
    const track = new KGMidiTrack('Lead', 1);
    (track as unknown as { tonePresetId?: unknown }).tonePresetId = undefined;
    (track as unknown as { toneSignalChain?: unknown }).toneSignalChain = undefined;
    project.setTracks([track]);
    project.setProjectStructureVersion(18);

    upgradeProjectToLatest(project);

    expect(project.getProjectStructureVersion()).toBe(19);
    expect(track.getTonePresetId()).toBe('off');
    expect(track.getToneSignalChain()).toEqual([]);
  });

  it('preserves an existing editable tone chain', () => {
    const project = new KGProject('Legacy V18');
    const track = new KGMidiTrack('Lead', 1);
    track.setTonePresetId('artist-inspired.gilmour.shine-lead');
    track.setToneSignalChain([{
      id: 'delay',
      type: 'delay',
      name: 'Delay',
      enabled: true,
      parameters: { timeMs: 430, feedback: 0.33, mix: 0.28 },
    }]);
    project.setTracks([track]);
    project.setProjectStructureVersion(18);

    upgradeProjectToLatest(project);

    expect(track.getTonePresetId()).toBe('artist-inspired.gilmour.shine-lead');
    expect(track.getToneSignalChain()).toEqual([
      expect.objectContaining({
        id: 'delay',
        parameters: expect.objectContaining({ timeMs: 430, mix: 0.28 }),
      }),
    ]);
  });
});
