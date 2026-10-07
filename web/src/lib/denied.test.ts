import { describe, expect, it } from 'vitest';
import { FILE_DENIED, FOLDER_DENIED } from '@vo/shared';
import { ApiFailure } from '../api';
import { addRefusal, deniedHint } from './denied';

describe('a folder or a file the system won’t open (Mac check of 1.9.0)', () => {
  it('says where to allow it on a Mac, the rights elsewhere — never «plug the drive in»', () => {
    const mac = deniedHint('folder', 'refresh', true);
    expect(mac).toMatch(/^macOS не дає відкрити цю папку\. /);
    expect(mac).toContain('Приватність і безпека → Файли та папки');
    expect(mac).toMatch(/Потім натисніть «Оновити»\.$/);
    expect(deniedHint('file', undefined, true)).toMatch(/^macOS не дає відкрити цей файл\. /);
    expect(deniedHint('folder', 'pick', false)).toBe(`${FOLDER_DENIED} Або виберіть іншу папку.`);
    expect(deniedHint('file', undefined, false)).toBe(FILE_DENIED);
  });

  it('tells the server’s refusal of an add from its other answers', () => {
    expect(addRefusal(new ApiFailure(FILE_DENIED, 403, FILE_DENIED), 'file')).toBe(
      deniedHint('file'),
    );
    expect(addRefusal(new ApiFailure('Файл не знайдено', 404, 'Файл не знайдено'), 'file')).toBe(
      'Файл не знайдено',
    );
  });
});

describe('an album or video item that can’t be used, in words (1.9.4)', () => {
  it('another computer first, then the refusal, then not found', async () => {
    const { unusable } = await import('./denied');
    const all = { missing: true, denied: true, elsewhere: true };
    expect(unusable('folder', all, 'Табір')).toBe('Папка з іншого комп’ютера: Табір');
    expect(unusable('folder', { missing: true, denied: true }, 'Табір')).toBe(
      'Немає доступу до папки: Табір',
    );
    expect(unusable('file', { missing: true }, 'a.mp4')).toBe('Файл не знайдено: a.mp4');
    expect(unusable('file', { missing: false }, 'a.mp4')).toBeNull();
  });
});
