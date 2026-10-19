import { useEffect, useRef, useState } from 'react';
import { Button, Group, SegmentedControl, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { api, type FoundImage } from '../api';
import { fileFromAddress } from '../lib/webImage';
import { tr, useLang } from '../i18n';

type Source = 'commons' | 'openverse';

/**
 * «Пошук зображень» in «Зображення» (1.19.0-beta.9, the author with the users' F1017-16): free pictures
 * from Wikimedia Commons or Openverse — a click adds one to the list with its author and licence (the
 * credit goes on screen with it, as its licence asks). `onAdd` keeps it as a file is kept.
 */
export function ImageSearch({
  onAdd,
  onClose,
}: {
  onAdd: (file: File, credit: string) => Promise<boolean>;
  onClose: () => void;
}) {
  useLang();
  const [q, setQ] = useState('');
  const [source, setSource] = useState<Source>('commons');
  const [found, setFound] = useState<{ images: FoundImage[]; more: boolean; page: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  /** the newest search: an answer to an older one (another source, a page before) is dropped (review) */
  const asked = useRef(0);

  const search = async (page = 1, from: Source = source) => {
    const query = q.trim();
    if (!query) return;
    const mine = ++asked.current;
    setBusy(true);
    try {
      const got = await api.searchImages(query, from, page);
      if (mine !== asked.current) return;
      setFound((was) =>
        page > 1 && was
          ? { images: [...was.images, ...got.images], more: got.more, page }
          : { ...got, page },
      );
    } catch (e) {
      if (mine === asked.current)
        notifications.show({ message: tr((e as Error).message), color: 'red' });
    } finally {
      if (mine === asked.current) setBusy(false);
    }
  };

  const take = async (img: FoundImage) => {
    if (adding) return;
    setAdding(img.id);
    try {
      const file = await fileFromAddress(img.url);
      const name = img.title || file.name.replace(/\.[^.]+$/, '');
      const named = new File([file], `${name.slice(0, 100)}.${file.name.split('.').pop()}`, {
        type: file.type,
      });
      if (await onAdd(named, img.credit))
        notifications.show({
          message: tr('Додано: {name}', { name }),
          color: 'green',
          autoClose: 1500,
        });
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    } finally {
      setAdding(null);
    }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <Group gap={6} wrap="nowrap">
        <TextInput
          ref={field}
          size="xs"
          style={{ flex: 1 }}
          leftSection={<IconSearch size={13} />}
          placeholder={tr('Що шукати, як-от «гори» чи «sunrise»')}
          aria-label={tr('Пошук зображень')}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              onClose();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              void search(1);
            }
          }}
        />
        <SegmentedControl
          size="xs"
          value={source}
          onChange={(v) => {
            setSource(v as Source);
            setFound(null);
            if (q.trim()) void search(1, v as Source);
          }}
          data={[
            { value: 'commons', label: tr('Вікісховище') },
            { value: 'openverse', label: 'Openverse' },
          ]}
          aria-label={tr('Де шукати')}
        />
        <Button
          size="xs"
          loading={busy && !found}
          disabled={!q.trim()}
          onClick={() => void search(1)}
        >
          {tr('Шукати')}
        </Button>
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        {tr(
          'Вільні зображення з автором і ліцензією; клацніть, щоб додати. Підпис автора буде на екрані — так вимагає ліцензія.',
        )}
      </Text>
      {found && (
        <>
          {found.images.length === 0 ? (
            <Text size="sm" c="dimmed" mt={6}>
              {tr('Нічого не знайдено')}
            </Text>
          ) : (
            <div className="vo-image-grid" style={{ marginTop: 6 }}>
              {found.images.map((img) => (
                <div key={img.id} className="vo-image-tile" data-found={img.id}>
                  <button
                    type="button"
                    className="vo-image-pick"
                    onClick={() => void take(img)}
                    disabled={!!adding}
                    title={`${img.title}\n${img.credit}`}
                    aria-label={tr('Додати «{name}»', { name: img.title || img.credit })}
                    style={{ opacity: adding && adding !== img.id ? 0.5 : 1 }}
                  >
                    <img src={img.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                  <Text size="xs" truncate px={4} py={2} c="dimmed" title={img.credit}>
                    {adding === img.id ? tr('Додаю…') : img.credit}
                  </Text>
                </div>
              ))}
            </div>
          )}
          {found.more && (
            <Button
              size="xs"
              variant="subtle"
              mt={6}
              loading={busy}
              onClick={() => void search(found.page + 1)}
            >
              {tr('Ще')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
