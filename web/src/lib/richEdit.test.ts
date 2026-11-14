import { describe, expect, it } from 'vitest';
import { insertDivider, markLines, surround } from './richEdit';

describe('the «Текст на екран» toolbar (1.22.0-beta.1, F1107-14)', () => {
  it('puts bold / italic around the selection, and takes them off again', () => {
    const on = surround('сьогодні о 18:00', 11, 16, '**');
    expect(on).toEqual({ text: 'сьогодні о **18:00**', start: 13, end: 18 });
    expect(surround(on.text, on.start, on.end, '**')).toEqual({
      text: 'сьогодні о 18:00',
      start: 11,
      end: 16,
    });
    expect(surround('слово', 0, 5, '*').text).toBe('*слово*');
  });

  it('marks the selected lines as a list, a numbered list or a heading — again: plain', () => {
    const text = 'перше\nдруге\nтретє';
    const list = markLines(text, 0, text.length, 'bullet');
    expect(list.text).toBe('- перше\n- друге\n- третє');
    expect(markLines(list.text, 0, list.text.length, 'bullet').text).toBe(text);
    expect(markLines(list.text, 0, list.text.length, 'number').text).toBe(
      '1. перше\n2. друге\n3. третє',
    );
    // the caret alone: its line
    expect(markLines(text, 8, 8, 'heading').text).toBe('перше\n# друге\nтретє');
    // empty lines stay empty and don't count
    expect(markLines('а\n\nб', 0, 4, 'number').text).toBe('1. а\n\n2. б');
  });

  it('puts a divider on a line of its own after the caret’s line', () => {
    expect(insertDivider('нове', 2).text).toBe('нове\n---\n');
    expect(insertDivider('нове\nстаре', 1).text).toBe('нове\n---\nстаре');
    expect(insertDivider('', 0).text).toBe('---\n');
  });
});
