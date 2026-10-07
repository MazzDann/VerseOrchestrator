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
