import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';
import { KGMidiRegion } from '../region/KGMidiRegion';

/**
 * V18 adds persisted aftertouch events to MIDI regions.
 * Existing projects simply receive an empty pressure-event collection.
 */
export function upgradeToV18(project: KGProject): KGProject {
  try {
    for (const track of project.getTracks()) {
      if (!(track instanceof KGMidiTrack)) continue;
      for (const region of track.getRegions()) {
        if (!(region instanceof KGMidiRegion)) continue;
        region.setPressureEvents(region.getPressureEvents());
      }
    }
  } finally {
    project.setProjectStructureVersion(18);
  }

  return project;
}
