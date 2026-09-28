/**
 * A speaker's remote walking a song (1.5.24): at its last stanza, while that stanza is on
 * screen, «Далі» empties the screen (the text goes, the background stays — «Сховати
 * текст»), «Далі» again is the end, and «Назад» brings exactly that stanza back.
 */
export type SongEndStep = 'hide' | 'show' | 'end' | 'walk';

export function songEndStep(o: {
  /** the cursor is on the song's last stanza */
  atLast: boolean;
  /** …and that stanza is what the screen shows */
  onScreen: boolean;
  /** the remote may hide the text */
  canHide: boolean;
  /** the screen's text is hidden (as this phone believes — see believedHidden) */
  hidden: boolean;
  delta: number;
}): SongEndStep {
  if (!o.atLast || !o.onScreen || !o.canHide) return 'walk';
  if (o.delta > 0) return o.hidden ? 'end' : 'hide';
  return o.hidden ? 'show' : 'walk';
}

/**
 * «Сховати текст» is a switch, and the screen's new state reaches the phone a moment
 * later: for END_GUARD_MS after its own press the phone trusts what it just did, so a
 * quick second tap doesn't flip the text straight back.
 */
export const END_GUARD_MS = 1500;

export interface EndGuard {
  key: string;
  at: number;
  hidden: boolean;
}

export function believedHidden(
  guard: EndGuard | null,
  key: string,
  now: number,
  screenHidden: boolean,
): boolean {
  return guard && guard.key === key && now - guard.at < END_GUARD_MS ? guard.hidden : screenHidden;
}
