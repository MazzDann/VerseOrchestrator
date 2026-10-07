import { ActionIcon, Divider, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconListDetails, IconPlaylistAdd } from '@tabler/icons-react';
import { EMPTY_SLIDE, type Slide } from '../../presenterBus';
import { type SharedPlaylist, type PlaylistEntry } from '../../lib/commands';
import { showsSomething } from '../../lib/slide';
import { inPhoneWords, summarize } from '../../lib/slide';
import { Monitor } from '../../components/Monitor';
import { tr, useLang } from '../../i18n';

/**
 * The desk's right column (1.9.0-beta.1): «На екрані» — the slide the operator's output shows,
 * as the hub's `slides` frame brings it (no images) —, the desk's own «Прев’ю», and the
 * operator's running order when this desk may see it (a row puts its item on screen).
 */
export function DeskAside({
  live,
  next,
  mine,
  preview,
  previewHint,
  onQueue,
  playlist,
  canShowItem,
  onShowItem,
}: {
  live: Slide | null;
  next: Slide | null;
  /** what is on screen came from this desk: its «Далі» walks it */
  mine: boolean;
  preview: Slide | null;
  previewHint: string;
  /** «У послідовність»: absent when this desk may not add to the running order */
  onQueue?: () => void;
  playlist: SharedPlaylist | null;
  canShowItem: boolean;
  onShowItem: (entry: PlaylistEntry) => void;
}) {
  useLang();
  const onScreen = !!live && showsSomething(live);
  // «Заставка» and the viewers' QR named in this page's language, as on a phone (1.4.2)
  const nowWords = inPhoneWords(summarize(live));
  const nextWords = next ? inPhoneWords(summarize(next)) : null;
  const at = playlist ? playlist.items.findIndex((i) => i.id === playlist.currentId) : -1;
  return (
    <ScrollArea h="100%" scrollbars="y">
      <Stack gap="md" p="sm">
        {/* side by side when the column goes under the verses (styles.css) */}
        <div className="vo-desk-monitors">
          <div>
            <Monitor
              slide={live ?? EMPTY_SLIDE}
              state={onScreen ? 'live' : 'idle'}
              title={tr('На екрані')}
              detail={nowWords?.reference || undefined}
            />
            <Text size="xs" c="dimmed" mt={6} truncate>
              {mine
                ? tr('Ви показали це звідси: «Далі» веде далі тут')
                : nextWords?.reference
                  ? tr('«Далі» в оператора: {reference}', { reference: nextWords.reference })
                  : ' '}
            </Text>
          </div>
          <div>
            <Monitor
              slide={preview ?? EMPTY_SLIDE}
              state={preview ? 'cue' : 'idle'}
              title={tr('Прев’ю')}
              detail={preview?.reference || undefined}
              actions={
                onQueue && preview ? (
                  <Tooltip label={tr('Додати в послідовність показу')}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={onQueue}
                      aria-label={tr('У послідовність')}
                    >
                      <IconPlaylistAdd size={14} />
                    </ActionIcon>
                  </Tooltip>
                ) : undefined
              }
            />
            {!preview && (
              <Text size="xs" c="dimmed" mt={6}>
                {previewHint}
              </Text>
            )}
          </div>
        </div>
        {playlist && (
          <div>
            <Divider
              label={
                <>
                  <IconListDetails size={14} style={{ marginInlineEnd: 6 }} />
                  {tr('Послідовність показу')}
                </>
              }
              labelPosition="left"
              mb={4}
            />
            {playlist.items.length === 0 ? (
              <Text size="xs" c="dimmed">
                {tr('Оператор ще нічого не додав.')}
              </Text>
            ) : (
              <Stack gap={2}>
                {playlist.items.map((it, i) => (
                  <Tooltip
                    key={it.id}
                    label={canShowItem ? tr('На екран') : tr('Не дозволено оператором')}
                    position="left"
                    openDelay={400}
                  >
                    <button
                      type="button"
                      className="vo-list-item"
                      data-selected={i === at ? 'true' : undefined}
                      aria-current={i === at ? 'true' : undefined}
                      disabled={!canShowItem}
                      onClick={() => onShowItem(it)}
                    >
                      <Text size="sm" truncate>
                        {it.label}
                      </Text>
                    </button>
                  </Tooltip>
                ))}
              </Stack>
            )}
          </div>
        )}
      </Stack>
    </ScrollArea>
  );
}
