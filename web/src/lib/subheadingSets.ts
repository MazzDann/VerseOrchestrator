/**
 * Which section titles a translation shows (1.16.0-beta.3, the author's choice «набір до
 * перекладу»): its own ('') or a set from a *.subheadings.SQLite3 file — the one picked for it,
 * else the set named after it («KJV-s» for KJV, «RST-п» for RST), else its own. A set is shown at
 * the places it holds: one made for another numbering is off in the Psalms — the user sees which
 * set is on.
 */
export function setFor(
  abbr: string,
  chosen: Readonly<Record<string, string>>,
  sets: readonly { abbr: string }[],
): string {
  if (Object.hasOwn(chosen, abbr)) {
    const picked = chosen[abbr];
    return picked === '' || sets.some((s) => s.abbr === picked) ? picked : '';
  }
  const own = abbr.toLowerCase();
  return sets.find((s) => setStem(s.abbr) === own)?.abbr ?? '';
}

/** A set's name without its module tail: «KJV-s» → «kjv», «RST-п» → «rst», «Геце-д(у)» → «геце». */
export function setStem(abbr: string): string {
  return abbr.toLowerCase().replace(/-[sпд](\([^)]*\))?$/u, ''); // i18n-ignore: the module's name tails
}
