import type { ReactNode } from 'react';
import { Group, Text } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { type Slide } from '../presenterBus';
import { SlideCanvas } from './SlideCanvas';

/**
 * Tally state of a monitor, as on a video switcher: `live` = this is what the audience
 * sees (red), `cue` = prepared but not on screen yet (amber), `idle` = nothing to show.
 */
export type TallyState = 'live' | 'cue' | 'idle';

const TALLY_VAR: Record<TallyState, string> = {
  live: 'var(--mantine-color-live-filled)',
  cue: 'var(--mantine-color-cue-filled)',
  idle: 'var(--mantine-color-default-border)',
};

/** A 16:9 slide monitor with a tally frame and a caption row (dot · title · detail). */
export function Monitor({
  slide,
  state,
  title,
  detail,
  actions,
}: {
  slide: Slide;
  state: TallyState;
  title: string;
  detail?: string;
  actions?: ReactNode;
}) {
  // the system asks for less motion (1.2.1): the monitor changes at once, no fades
  // (read at once, so a monitor that mounts with a slide doesn't fade it in first)
  const calm = useReducedMotion(false, { getInitialValueInEffect: false });
  return (
    <div style={{ width: '100%' }}>
      <Group justify="space-between" gap={6} wrap="nowrap" mb={6} mih={22}>
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              flex: 'none',
              background: state === 'idle' ? 'var(--mantine-color-dimmed)' : TALLY_VAR[state],
            }}
          />
          <Text size="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
            {title}
          </Text>
          {detail && (
            <Text size="xs" c="dimmed" truncate>
              {detail}
            </Text>
          )}
        </Group>
        {actions}
      </Group>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#000',
          // Tally frame: a 2px ring outside the picture so the slide itself isn't cropped.
          boxShadow: `0 0 0 ${state === 'idle' ? 1 : 2}px ${TALLY_VAR[state]}`,
        }}
      >
        <SlideCanvas slide={slide} calm={calm} />
      </div>
    </div>
  );
}
