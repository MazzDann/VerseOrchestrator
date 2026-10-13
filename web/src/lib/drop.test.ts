import { describe, expect, it } from 'vitest';
import { droppedKind, parentOf } from './drop';

describe('a drop on the control window (1.14.0-beta.1)', () => {
  it('pictures, videos and the rest, by type or by name', () => {
    expect(droppedKind({ name: 'a.JPG', type: '' })).toBe('image');
    expect(droppedKind({ name: 'x', type: 'image/png' })).toBe('image');
    expect(droppedKind({ name: 'IMG_1.HEIC', type: '' })).toBe('image');
    expect(droppedKind({ name: 'clip.mov', type: '' })).toBe('video');
    expect(droppedKind({ name: 'x', type: 'video/mp4' })).toBe('video');
    expect(droppedKind({ name: 'archive.zip', type: 'application/zip' })).toBe('other');
  });

  it('since 1.17.1 everything the app takes: documents, modules, segments, songs, vectors', () => {
    expect(droppedKind({ name: 'Проповідь.docx', type: '' })).toBe('document');
    expect(droppedKind({ name: 'Лекція.pdf', type: 'application/pdf' })).toBe('document');
    expect(droppedKind({ name: '~$оповідь.docx', type: '' })).toBe('other');
    expect(droppedKind({ name: 'UBIO.SQLite3', type: '' })).toBe('module');
    expect(droppedKind({ name: 'Strong.dictionary.SQLite3', type: '' })).toBe('module');
    expect(droppedKind({ name: 't-3.vodb.gz', type: '' })).toBe('segment');
    expect(droppedKind({ name: '№12 Боже.pptx', type: '' })).toBe('song');
    expect(droppedKind({ name: 'vectors.db', type: '' })).toBe('vectors');
    expect(droppedKind({ name: 'vectors (Mac).db', type: '' })).toBe('vectors');
    expect(droppedKind({ name: 'library.db', type: '' })).toBe('other');
  });

  it('the folder a found path is in', () => {
    expect(parentOf('C:\\Users\\me\\Pictures\\Табір')).toBe('C:\\Users\\me\\Pictures');
    expect(parentOf('C:\\Photos')).toBe('C:\\');
    expect(parentOf('/Users/me/Pictures/Табір/')).toBe('/Users/me/Pictures');
  });
});
