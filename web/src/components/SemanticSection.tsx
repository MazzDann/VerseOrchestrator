import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  Progress,
  ScrollArea,
  SegmentedControl,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconDownload } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EMBED_MODELS, N_ } from '@vo/shared';
import { api, type EmbedModelId, type SemanticState } from '../api';
import { fmtNumber, tr, useLang } from '../i18n';
import { formatSize, langName } from '../lib/catalog';
import { onePerLanguage } from '../lib/vectorPick';
import { useServer } from '../serverStore';
import { useStore } from '../store';

/**
 * «Пошук за змістом» (1.15.0-beta.2, users' ask F1005-08): a query that starts with «~» finds verses
 * by what they say, not by their words. The model (Швидка / Точна — the author's call: both, a
 * choice) is downloaded here, and every translation's vectors are made here, in the background.
 */

/**
 * Minutes a Bible (31 000 verses) takes, on half the processor and on all of it — measured on the PC
 * (i3-10100F, 4 cores / 8 threads): «Швидка» 110 / 154 verses a second, «Точна» 22 / 42.
 */
const MINUTES: Record<EmbedModelId, { half: number; full: number }> = {
  fast: { half: 5, full: 3.5 },
  precise: { half: 24, full: 12.5 },
};

export function SemanticSection({ active }: { active: boolean }) {
  const ui = useLang();
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
  const done = s?.translations.filter((t) => t.state === 'done') ?? [];
  // which translations get vectors (1.15.1): the main one by default — one is enough to find a place
  const mainId = useStore((x) => x.selectedTranslationIds[0] ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const missingKey = missing.map((t) => t.id).join(',');
  useEffect(() => {
    setPicked((p) => {
      const still = p.filter((id) => missing.some((t) => String(t.id) === id));
      if (still.length || p.length) return still;
      return missing.some((t) => t.id === mainId) ? [String(mainId)] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, mainId]);
  const minutes = model ? MINUTES[model.id][s?.fullCpu ? 'full' : 'half'] : 0;

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
                  min: fmtNumber(minutes),
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
              <Text size="xs" c="dimmed">
                {tr(
                  'Досить одного перекладу: за його векторами пошук знаходить місця за запитом будь-якою мовою й відкриває їх у головному перекладі. Інші переклади додають точності для своїх слів.',
                )}
              </Text>
              <Text size="xs">
                {done.length > 0 && <IconCheck size={12} style={{ verticalAlign: -1 }} />}{' '}
                {done.length > 0
                  ? tr('Вектори є: {list}.', { list: done.map((t) => t.abbr).join(', ') })
                  : tr('Векторів ще немає.')}
              </Text>
              {missing.length > 0 && job?.phase !== 'running' && (
                <>
                  <Text size="xs" c="dimmed">
                    {tr('Виберіть переклади, для яких обчислити вектори:')}
                  </Text>
                  {/* «Усі», «Один на мову», «Головний» — the author's ask: a choice, «all» on top */}
                  <Group gap="xs" wrap="wrap">
                    <Checkbox
                      size="xs"
                      label={tr('Усі')}
                      checked={picked.length === missing.length}
                      indeterminate={picked.length > 0 && picked.length < missing.length}
                      onChange={(e) =>
                        setPicked(e.currentTarget.checked ? missing.map((t) => String(t.id)) : [])
                      }
                    />
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      onClick={() =>
                        // every row: a language with vectors already is left out
                        setPicked(onePerLanguage(s.translations, mainId).map(String))
                      }
                    >
                      {tr('Один на мову')}
                    </Button>
                    {mainId != null && missing.some((t) => t.id === mainId) && (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={() => setPicked([String(mainId)])}
                      >
                        {tr('Лише головний')}
                      </Button>
                    )}
                  </Group>
                  <ScrollArea.Autosize mah="10rem" type="auto">
                    <Checkbox.Group value={picked} onChange={setPicked}>
                      <Stack gap={4}>
                        {missing.map((t) => (
                          <Checkbox
                            key={t.id}
                            size="xs"
                            value={String(t.id)}
                            title={t.title}
                            label={[
                              t.abbr,
                              t.language && langName(t.language, ui),
                              t.verses > 0 && t.verses < 20000 && tr('лише частина Біблії'),
                              t.state === 'partial' && tr('частково'),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          />
                        ))}
                      </Stack>
                    </Checkbox.Group>
                  </ScrollArea.Autosize>
                </>
              )}
              <Switch
                size="xs"
                label={tr('Увесь процесор')}
                description={tr(
                  'Швидше: «Точна» — удвічі, «Швидка» — в 1,4 раза. Поки вектори обчислюються, показ може пригальмовувати.',
                )}
                checked={s.fullCpu}
                disabled={busy || job?.phase === 'running'}
                onChange={(e) => void act(() => api.setSemanticFullCpu(e.currentTarget.checked))}
              />
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
                      disabled={picked.length === 0}
                      onClick={() => void act(() => api.computeVectors(picked.map(Number)))}
                    >
                      {tr('Обчислити для вибраних: {n} (≈ {min} хв)', {
                        n: String(picked.length),
                        min: fmtNumber(Math.ceil(picked.length * minutes)),
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
