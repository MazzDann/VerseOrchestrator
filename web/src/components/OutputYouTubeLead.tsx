import { useContext } from 'react';
import { type SlideVideo } from '../presenterBus';
import { YouTubeLead } from './YouTubeLead';
import { VideoSoundContext, postYTNote } from '../lib/youtube';

/**
 * «Повний плеєр у вікні показу» (1.21.0-beta.8, F1024-08): on the output (show) window the video IS
 * the operator's own interactive YouTube player, filling the 2nd screen. The operator's pauses, plays
 * and jumps here go back to the control window on the YouTube channel (`postYTNote` 'move'), which
 * puts them on the show's clock so every window — phones, a second «Показ» — follows. It sounds when
 * this window holds the sound lock (VideoSoundContext). The length goes back the same way.
 */
export function OutputYouTubeLead({ video }: { video: SlideVideo }) {
  const sound = useContext(VideoSoundContext);
  const id = video.youtube!;
  return (
    <YouTubeLead
      video={video}
      sound={sound}
      fill
      onMove={(to) => postYTNote({ t: 'move', youtube: id, to })}
      onLength={(duration) => postYTNote({ t: 'length', youtube: id, duration })}
    />
  );
}
