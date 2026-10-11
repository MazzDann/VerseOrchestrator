import { useState } from 'react';
import { Button, Group, Progress, ScrollArea, SegmentedControl, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconDownload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EMBED_MODELS, N_ } from '@vo/shared';
import { api, type EmbedModelId, type SemanticState } from '../api';
import { fmtNumber, tr, useLang } from '../i18n';
import { formatSize } from '../lib/catalog';
import { useServer } from '../serverStore';

/**
 * «Пошук за змістом» (1.15.0-beta.2, users' ask F1005-08): a query that starts with «~» finds verses
 * by what they say, not by their words. The model (Швидка / Точна — the author's call: both, a
 * choice) is downloaded here, and every translation's vectors are made here, in the background.
 */

/** Minutes a Bible (31 000 verses) takes on half the processor — measured on the PC (i3-10100F). */
const MINUTES: Record<EmbedModelId, number> = { fast: 5, precise: 24 };

export function SemanticSection({ active }: { active: boolean }) {
  useLang();
  const queryClient = useQueryClient();
  const serverAvailable = useServer((s) => s.available);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['semantic'],
    queryFn: () => api.semantic(),
    enabled: active && serverAvailable !== false,
    // every second while a model comes or vectors are made (the hub tells a control window too)
    refetchInterval: (x) =>
      x.state.data?.job.phase === 'running' ||
      x.state.data?.models.some((m) => m.download.phase === 'downloading')
        ? 1000
        : false,
    retry: false,
  });
  const act = async (fn: () => Promise<SemanticState>) => {
    setBusy(true);
    try {
      queryClient.setQueryData(['semantic'], await fn());
      // a «~ …» answered «not set up» before is asked again (review)
      void queryClient.invalidateQueries({ queryKey: ['search'] });
    } catch (e) {
      notifications.show({ message: (e as Error).message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const s = q.data;
  const chosen = s?.model ?? null;
  const model = s?.models.find((m) => m.id === chosen);
  const job = s?.job;
  const missing = s?.translations.filter((t) => t.state !== 'done') ?? [];
  const done = (s?.translations.length ?? 0) - missing.length;

  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        {tr('Пошук за змістом')}
      </Text>
      <Text size="xs" c="dimmed">
        {tr(
          'Почніть запит із ~, наприклад «~ про прощення», — і застосунок знайде вірші за змістом, навіть іншими словами чи іншою мовою.',
        )}
      </Text>
      {serverAvailable === false ? (
        <Text size="xs" c="dimmed">
          {tr('Модель і вектори готує застосунок на цьому комп’ютері.')}
        </Text>
      ) : !s ? (
        <Text size="xs" c="dimmed">
          {q.isError ? (q.error as Error).message : tr('Завантаження…')}
        </Text>
      ) : (
        <>
          <SegmentedControl
            size="xs"
            fullWidth
            value={chosen ?? 'off'}
            disabled={busy || job?.phase === 'running'}
            onChange={(v) =>
              void act(() => api.setSemanticModel(v === 'off' ? null : (v as EmbedModelId)))
            }
            data={[
              { value: 'off', label: tr('Вимкнено') },
              ...s.models.map((m) => ({ value: m.id, label: tr(EMBED_MODELS[m.id].label) })),
            ]}
            aria-label={tr('Модель для пошуку за змістом')}
          />
          {model && (
            <Text size="xs" c="dimmed">
              {tr(
                chosen === 'fast'
                  ? N_('Швидка: {name}, {size}; ≈ {min} хв на переклад.')
                  : N_('Точна: {name}, {size}; знаходить краще, ≈ {min} хв на переклад.'),
                {
                  name: model.name,
                  size: formatSize(model.bytes),
                  min: String(MINUTES[model.id]),
                },
              )}
            </Text>
          )}
          {model && !model.installed && (
            <ModelDownload
              m={model}
              busy={busy}
              onDownload={() => void act(() => api.downloadModel(model.id))}
              onCancel={() => void act(() => api.cancelModel())}
            />
          )}
          {model?.installed && (
            <>
              <Text size="xs">
                <IconCheck size={12} style={{ verticalAlign: -1 }} />{' '}
                {tr('Вектори є для {n} з {total} перекладів.', {
                  n: String(done),
                  total: String(s.translations.length),
                })}
              </Text>
              {s.translations.length > 0 && (
                <ScrollArea.Autosize mah="7.5rem" type="auto">
                  <Text size="xs" c="dimmed">
                    {s.translations.map((t, i) => (
                      <span key={t.id}>
                        {i > 0 && ' · '}
                        <span style={{ fontWeight: t.state === 'done' ? 500 : undefined }}>
                          {t.abbr}
                        </span>
                        {t.state === 'done'
                          ? ' ✓'
                          : t.state === 'partial'
                            ? ` (${tr('частково')})`
                            : ''}
                      </span>
                    ))}
                  </Text>
                </ScrollArea.Autosize>
              )}
              {job?.phase === 'running' ? (
                <Stack gap={4}>
                  <Group gap="xs" wrap="nowrap">
                    <Progress
                      style={{ flex: 1 }}
                      value={
                        job.current ? (job.current.done / Math.max(1, job.current.total)) * 100 : 0
                      }
                      aria-label={tr('Вектори')}
                    />
                    <Button
                      size="xs"
                      variant="default"
                      onClick={() => void act(() => api.stopVectors())}
                    >
                      {tr('Зупинити')}
                    </Button>
                  </Group>
                  <Text size="xs" c="dimmed" aria-live="polite">
                    {job.current
                      ? tr('{abbr}: {done} з {total} віршів · {rate} за секунду', {
                          abbr: job.current.abbr,
                          done: fmtNumber(job.current.done),
                          total: fmtNumber(job.current.total),
                          rate: String(job.rate),
                        }) + (job.left ? ` · ${tr('далі ще {n}', { n: String(job.left) })}` : '')
                      : tr('Готую модель…')}
                  </Text>
                </Stack>
              ) : (
                missing.length > 0 && (
                  <Group>
                    <Button
                      size="xs"
                      variant="light"
                      loading={busy}
                      onClick={() => void act(() => api.computeVectors())}
                    >
                      {tr('Обчислити для {n} перекладів (≈ {min} хв)', {
                        n: String(missing.length),
                        min: String(missing.length * MINUTES[model.id]),
                      })}
                    </Button>
                  </Group>
                )
              )}
              {job?.phase === 'failed' && job.error && (
                <Text size="xs" c="orange">
                  {tr(job.error.key, job.error.vars)}
                </Text>
              )}
              <Group>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  disabled={busy || job?.phase === 'running'}
                  onClick={() => void act(() => api.removeModel(model.id))}
                >
                  {tr('Видалити модель ({size})', { size: formatSize(model.bytes) })}
                </Button>
              </Group>
            </>
          )}
        </>
      )}
    </Stack>
  );
}

function ModelDownload({
  m,
  busy,
  onDownload,
  onCancel,
}: {
  m: SemanticState['models'][number];
  busy: boolean;
  onDownload: () => void;
  onCancel: () => void;
}) {
  const d = m.download;
  if (d.phase === 'downloading')
    return (
      <Group gap="xs" wrap="nowrap">
        <Progress
          style={{ flex: 1 }}
          value={(d.got / Math.max(1, d.total)) * 100}
          aria-label={tr('Завантаження')}
        />
        <Text size="xs" c="dimmed">
          {Math.round((d.got / Math.max(1, d.total)) * 100)} %
        </Text>
        <Button size="xs" variant="default" onClick={onCancel}>
          {tr('Скасувати')}
        </Button>
      </Group>
    );
  return (
    <Stack gap={4}>
      {d.phase === 'failed' && d.note && (
        <Text size="xs" c="orange">
          {tr(d.note.key, d.note.vars)}
        </Text>
      )}
      <Group>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={14} />}
          loading={busy}
          onClick={onDownload}
        >
          {tr('Завантажити модель ({size})', { size: formatSize(m.bytes) })}
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        {tr('З Hugging Face; ліцензія {licence}.', { licence: EMBED_MODELS[m.id].licence })}
      </Text>
    </Stack>
  );
}
