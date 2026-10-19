import { describe, expect, it } from 'vitest';
import { youtubeIdOf } from './youtube';
import { youtubeIdOf as serverIdOf } from '../../../server/src/videos';

describe('a YouTube address in the control window (1.19.0-beta.6)', () => {
  it('reads the id as the server does', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30s',
      'https://youtu.be/aqz-KE-bpKQ?si=abc',
      'youtube.com/shorts/aqz-KE-bpKQ',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'aqz-KE-bpKQ',
      'https://vimeo.com/123',
      'https://evil.example/watch?v=aqz-KE-bpKQ',
      'Ів 3:16',
    ])
      expect(youtubeIdOf(url), url).toBe(serverIdOf(url));
    expect(youtubeIdOf('https://youtu.be/aqz-KE-bpKQ')).toBe('aqz-KE-bpKQ');
  });
});
