import { describe, expect, it } from 'vitest';
import { droppedKind, parentOf } from './drop';

describe('a drop on the control window (1.14.0-beta.1)', () => {
  it('pictures, videos and the rest, by type or by name', () => {
    expect(droppedKind({ name: 'a.JPG', type: '' })).toBe('image');
    expect(droppedKind({ name: 'x', type: 'image/png' })).toBe('image');
    expect(droppedKind({ name: 'IMG_1.HEIC', type: '' })).toBe('image');
    expect(droppedKind({ name: 'clip.mov', type: '' })).toBe('video');
    expect(droppedKind({ name: 'x', type: 'video/mp4' })).toBe('video');
    expect(droppedKind({ name: 'song.pptx', type: '' })).toBe('other');
  });

  it('the folder a found path is in', () => {
    expect(parentOf('C:\\Users\\me\\Pictures\\Табір')).toBe('C:\\Users\\me\\Pictures');
    expect(parentOf('C:\\Photos')).toBe('C:\\');
    expect(parentOf('/Users/me/Pictures/Табір/')).toBe('/Users/me/Pictures');
  });
});
