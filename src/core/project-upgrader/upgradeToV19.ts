import { KGProject } from '../KGProject';
import { KGMidiTrack } from '../track/KGMidiTrack';

/**
 * V19 persists LP5 tone preset selection and the backend-neutral signal chain
 * on MIDI tracks. Legacy projects receive a clean bypassed tone state.
 */
export function upgradeToV19(project: KGProject): KGProject {
  try {
    for (const track of project.getTracks()) {
      if (!(track instanceof KGMidiTrack)) continue;
      track.setTonePresetId(track.getTonePresetId());
      track.setToneSignalChain(track.getToneSignalChain());
    }
  } finally {
    project.setProjectStructureVersion(19);
  }
  return project;
}
