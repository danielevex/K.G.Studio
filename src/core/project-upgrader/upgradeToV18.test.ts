import { describe, expect, it } from 'vitest';
import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGMidiRegion } from '../region/KGMidiRegion';
import { KGMidiPressureEvent } from '../midi/KGMidiPressureEvent';
import { upgradeProjectToLatest } from './KGProjectUpgrader';

describe('upgradeToV18', () => {
  it('preserves existing aftertouch data and upgrades legacy MIDI regions to V18', () => {
    const project = new KGProject('Legacy V17');
    const track = new KGMidiTrack('Lead', 1);
    const region = new KGMidiRegion('region', '1', 0, 'Lead take', 0, 4);
    region.addPressureEvent(new KGMidiPressureEvent('pressure-1', 1, 88, 'channel', null));
    track.setRegions([region]);
    project.setTracks([track]);
    project.setProjectStructureVersion(17);

    upgradeProjectToLatest(project);

    expect(project.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
    expect(region.getPressureEvents()).toHaveLength(1);
    expect(region.getPressureEvents()[0].getValue()).toBe(88);
    expect(region.getPressureEvents()[0].getKind()).toBe('channel');
  });

  it('gives legacy regions a safe empty pressure collection', () => {
    const project = new KGProject('Legacy V17');
    const track = new KGMidiTrack('Lead', 1);
    const region = new KGMidiRegion('region', '1', 0, 'Lead take', 0, 4);
    (region as unknown as { pressureEvents?: unknown }).pressureEvents = undefined;
    track.setRegions([region]);
    project.setTracks([track]);
    project.setProjectStructureVersion(17);

    upgradeProjectToLatest(project);

    expect(region.getPressureEvents()).toEqual([]);
    expect(project.getProjectStructureVersion()).toBe(KGProject.CURRENT_PROJECT_STRUCTURE_VERSION);
  });
});
