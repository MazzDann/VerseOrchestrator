import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSettings, SETTINGS_INDEX, textHolds } from './settingsSearch';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** The labels a part of the panel shows: inputs' labels and the headings over a control. */
const labelsOf = (src: string) => [
  ...new Set(
    [
      // a tooltip's words name a button, not a setting
      ...src.matchAll(/(?<!Tooltip\s+)label=\{tr\('([^']+)'\)\}/g),
      ...src.matchAll(/fw=\{500\}[^>]*>\s*\{tr\('([^']+)'\)\}/g),
    ].map((m) => m[1]),
  ),
];

describe('the settings search knows every setting (1.13.0-beta.3, F1010-11)', () => {
  it('each label of the panel is in the index, under its section', () => {
    const panel = read('components/SettingsPanel.tsx');
    const missing: string[] = [];
    for (const part of panel.split(/<Section\s+value="/).slice(1)) {
      const section = part.slice(0, part.indexOf('"'));
      for (const label of labelsOf(part.slice(0, part.indexOf('</Section>'))))
        if (!SETTINGS_INDEX.some((e) => e.section === section && e.label === label))
          missing.push(`${section}: ${label}`);
    }
    for (const label of labelsOf(read('components/HotkeysSettings.tsx')))
      if (!SETTINGS_INDEX.some((e) => e.section === 'hotkeys' && e.label === label))
        missing.push(`hotkeys: ${label}`);
    expect(missing).toEqual([]);
  });

  it('finds by a word of the label, a synonym, a key’s name — and opens no section for nothing', () => {
    const sections = (q: string) => [...new Set(findSettings(q).map((e) => e.section))];
    expect(sections('без анімації')).toEqual(['motion']);
    expect(sections('наплив')).toContain('motion');
    expect(sections('шрифт')).toEqual(expect.arrayContaining(['text', 'countdown']));
    expect(sections('backup')).toEqual(['app']);
    expect(sections('Прев’ю: далі')).toContain('hotkeys');
    expect(findSettings('q')).toEqual([]);
    expect(findSettings('щосьзовсімінше')).toEqual([]);
  });

  it('marks text the way it finds it (case, apostrophes, й)', () => {
    expect(textHolds('Перехід між слайдами', 'ПЕРЕХІД')).toBe(true);
    expect(textHolds('Розташування панелі прев’ю', "прев'ю")).toBe(true);
    expect(textHolds('Шрифт', 'ш')).toBe(false);
  });
});
