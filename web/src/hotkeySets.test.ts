import { describe, expect, it } from 'vitest';
import {
  HOTKEY_ACTIONS,
  HOTKEY_GROUPS,
  addChord,
  conflictsForAction,
  defaultKeymap,
  groupOf,
  keySet,
  removeChord,
  sanitizeKeymap,
  whereItWorks,
} from './hotkeys';

describe('the keys’ settings (1.24.0-beta.4)', () => {
  it('every action stands in a group the panel shows', () => {
    const groups = new Set(HOTKEY_GROUPS.map((g) => g.id));
    for (const a of HOTKEY_ACTIONS) expect(groups.has(groupOf(a.id)), a.id).toBe(true);
    expect(groupOf('chapterNext')).toBe('find');
    expect(groupOf('black')).toBe('show');
  });

  it('a key added once, taken away one by one', () => {
    expect(addChord('f5,f2', 'f9')).toBe('f5,f2,f9');
    expect(addChord('f5,f2', 'f2')).toBe('f5,f2');
    expect(addChord('', 'n')).toBe('n');
    expect(removeChord('f5,f2', 'f5')).toBe('f2');
    expect(removeChord('f2', 'f2')).toBe('');
  });

  it('«без клавіші» on purpose stays after a reload; a missing action gets its default', () => {
    const km = { ...defaultKeymap(false, false), black: '' };
    expect(sanitizeKeymap(km, false, false).black).toBe('');
    const { cover: _gone, ...older } = defaultKeymap(false, false);
    void _gone;
    expect(sanitizeKeymap(older, false, false).cover).toBe('l');
    // the app: cleared there stays cleared once the keymap is the app's
    const app = { ...defaultKeymap(false, true), newText: '' };
    expect(sanitizeKeymap(app, false, true, false).newText).toBe('');
    // …but a browser's keymap read in the app the first time takes the app's defaults
    expect(sanitizeKeymap(defaultKeymap(false, false), false, true, true).newText).toBe('ctrl+n');
  });

  it('says where a key works', () => {
    const of = (id: string) => HOTKEY_ACTIONS.find((a) => a.id === id)!;
    expect(whereItWorks(of('project'))).toEqual({ inFields: true, appOnly: false });
    expect(whereItWorks(of('newText'))).toEqual({ inFields: false, appOnly: true });
    expect(whereItWorks(of('black'))).toEqual({ inFields: false, appOnly: false });
  });

  it('the ready sets clash with nothing (the app and a browser, Windows and a Mac)', () => {
    for (const set of ['standard', 'powerpoint', 'clicker'] as const)
      for (const mac of [false, true])
        for (const desktop of [false, true]) {
          const km = keySet(set, mac, desktop);
          for (const a of HOTKEY_ACTIONS)
            expect(conflictsForAction(km, a.id), `${set} ${mac} ${desktop} ${a.id}`).toEqual([]);
        }
    const pp = keySet('powerpoint', false, true);
    expect(pp.black).toBe('b,period');
    expect(pp.blank).toBe('w,comma');
    expect(pp.advanceNext.split(',')).toEqual(expect.arrayContaining(['space', 'n']));
    expect(keySet('clicker', false, true).chorus).toBe('');
  });
});
