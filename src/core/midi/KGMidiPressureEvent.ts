import { Expose } from 'class-transformer';
import type { Selectable } from '../../components/interfaces';

export type MidiPressureKind = 'channel' | 'poly';

/**
 * Persisted MIDI aftertouch event.
 *
 * Channel pressure applies to the whole MIDI channel.
 * Poly pressure is tied to a specific note number.
 */
export class KGMidiPressureEvent implements Selectable {
  @Expose()
  private id: string = '';

  @Expose()
  private beat: number = 0;

  @Expose()
  private value: number = 0;

  @Expose()
  private kind: MidiPressureKind = 'channel';

  @Expose()
  private note: number | null = null;

  @Expose()
  private selected: boolean = false;

  constructor(
    id: string,
    beat: number = 0,
    value: number = 0,
    kind: MidiPressureKind = 'channel',
    note: number | null = null,
  ) {
    this.id = id;
    this.beat = beat;
    this.value = value;
    this.kind = kind;
    this.note = kind === 'poly' ? note : null;
  }

  public getId(): string { return this.id; }
  public getBeat(): number { return this.beat; }
  public getValue(): number { return this.value; }
  public getKind(): MidiPressureKind { return this.kind; }
  public getNote(): number | null { return this.note; }

  public setId(id: string): void { this.id = id; }
  public setBeat(beat: number): void { this.beat = beat; }
  public setValue(value: number): void { this.value = Math.max(0, Math.min(127, Math.round(value))); }
  public setKind(kind: MidiPressureKind): void {
    this.kind = kind;
    if (kind === 'channel') this.note = null;
  }
  public setNote(note: number | null): void {
    this.note = this.kind === 'poly' && note !== null
      ? Math.max(0, Math.min(127, Math.round(note)))
      : null;
  }

  public select(): void { this.selected = true; }
  public deselect(): void { this.selected = false; }
  public isSelected(): boolean { return this.selected; }

  public getRootType(): string { return 'KGMidiPressureEvent'; }
  public getCurrentType(): string { return 'KGMidiPressureEvent'; }
}
