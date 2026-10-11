/**
 * Grammar codes (1.16.0-beta.2): a word in a Greek or Hebrew module carries `<m>V-AAI-3S</m>` after
 * its Strong number, and a Strong's dictionary explains the codes in `morphology_indications`. A
 * code is there whole («N-PRI», «HVqp3ms»), or as its parts: the head («V» Verb) and each «-PART»
 * («-AAI» Aor Act Ind, for «V» only; «-3S» 3rd Sing, for any).
 */

export interface MorphologyMeaning {
  dictionary: string;
  meaning: string;
}

export interface MorphologyCandidate {
  dictionary: string;
  indication: string;
  /** the head a «-PART» is for; '' = any */
  applicableTo: string;
  meaning: string;
}

/** The indications to look up for a code: itself, the Hebrew «H» form, its head and parts. */
export function morphologyKeys(code: string): string[] {
  const parts = code.split('-');
  const keys = [code, `H${code}`, parts[0], ...parts.slice(1).map((p) => `-${p}`)];
  return [...new Set(keys.filter((k) => k && k !== '-'))];
}

/** Each dictionary's meaning for a code, from the candidate rows; a dictionary without the head says nothing. */
export function explainMorphology(code: string, rows: MorphologyCandidate[]): MorphologyMeaning[] {
  const byDict = new Map<string, MorphologyCandidate[]>();
  for (const r of rows) {
    const list = byDict.get(r.dictionary) ?? [];
    list.push(r);
    byDict.set(r.dictionary, list);
  }
  const out: MorphologyMeaning[] = [];
  for (const [dictionary, list] of byDict) {
    const find = (indication: string, head?: string) =>
      list.find((r) => r.indication === indication && head != null && r.applicableTo === head) ??
      list.find((r) => r.indication === indication && r.applicableTo === '');
    const whole = find(code) ?? find(`H${code}`);
    if (whole) {
      out.push({ dictionary, meaning: whole.meaning });
      continue;
    }
    const [head, ...rest] = code.split('-');
    const first = find(head);
    if (!first || rest.length === 0) continue;
    // a part no dictionary row explains stays as written
    const meanings = rest.map((p) => find(`-${p}`, head)?.meaning ?? p);
    out.push({ dictionary, meaning: [first.meaning, ...meanings].join(' · ') });
  }
  return out;
}
