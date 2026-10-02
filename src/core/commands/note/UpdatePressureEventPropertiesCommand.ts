import { KGCommand } from '../KGCommand';
import { KGCore } from '../../KGCore';
import { KGMidiPressureEvent, type MidiPressureKind } from '../../midi/KGMidiPressureEvent';
import { KGMidiRegion } from '../../region/KGMidiRegion';
import { KGTrack } from '../../track/KGTrack';

interface PressureEventSnapshot {
  pressureEventId: string;
  beat: number;
  value: number;
  kind: MidiPressureKind;
  note: number | null;
}

interface PressureEventUpdate {
  pressureEventId: string;
  beat?: number;
  value?: number;
  kind?: MidiPressureKind;
  note?: number | null;
}

export class UpdatePressureEventPropertiesCommand extends KGCommand {
  private regionId: string;
  private snapshots: PressureEventSnapshot[];
  private updates: PressureEventUpdate[];
  private targetRegion: KGMidiRegion | null = null;
  private parentTrack: KGTrack | null = null;

  constructor(regionId: string, snapshots: PressureEventSnapshot[], updates: PressureEventUpdate[]) {
    super();
    this.regionId = regionId;
    this.snapshots = [...snapshots];
    this.updates = [...updates];
  }

  execute(): void {
    const tracks = KGCore.instance().getCurrentProject().getTracks();

    for (const track of tracks) {
      const region = track.getRegions().find(candidate => candidate.getId() === this.regionId);
      if (region instanceof KGMidiRegion) {
        this.targetRegion = region;
        this.parentTrack = track;
        break;
      }
    }

    if (!this.targetRegion) {
      throw new Error(`Region with ID ${this.regionId} not found`);
    }

    for (const update of this.updates) {
      const event = this.targetRegion.getPressureEvents().find(candidate => candidate.getId() === update.pressureEventId);
      if (!event) continue;
      if (update.beat !== undefined) event.setBeat(update.beat);
      if (update.value !== undefined) event.setValue(update.value);
      if (update.kind !== undefined) event.setKind(update.kind);
      if (update.note !== undefined) event.setNote(update.note);
    }
  }

  undo(): void {
    if (!this.targetRegion) {
      throw new Error('Cannot undo: command was not executed');
    }

    for (const snapshot of this.snapshots) {
      const event = this.targetRegion.getPressureEvents().find(candidate => candidate.getId() === snapshot.pressureEventId);
      if (!event) continue;
      event.setBeat(snapshot.beat);
      event.setValue(snapshot.value);
      event.setKind(snapshot.kind);
      event.setNote(snapshot.note);
    }
  }

  getDescription(): string {
    const count = this.snapshots.length;
    return count === 1 ? 'Update aftertouch event' : `Update ${count} aftertouch events`;
  }

  public getParentTrack(): KGTrack | null {
    return this.parentTrack;
  }
}
