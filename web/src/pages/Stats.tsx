import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Popover,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChartBar, IconDownload, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ShownKind, type StatsSummary } from '../api';
import { probeServer, useServer } from '../serverStore';
import { currentLocale, fmtNumber, N_, tr, trn, useLang } from '../i18n';

/**
 * «Статистика показу» (1.18.0-beta.4, server/src/stats.ts): what was on screen, how often and how
 * long — songs, the Bible's books, documents — and a day's report. One hue, the app's accent:
 * a bar's length or a cell's depth is the amount; the numbers stand beside the bars, the export
 * gives every row. Opened from Налаштування вигляду → Дані.
 */

type Period = '7' | '30' | '365' | 'all';
/** a week or a month = that many calendar days to today, as the columns draw them (review) */
const periodFrom = (p: Period, now: number) => {
  if (p === 'all') return 0;
  const d = new Date(now);
  return p === '365'
    ? new Date(d.getFullYear(), d.getMonth() - 11, 1).getTime()
    : new Date(d.getFullYear(), d.getMonth(), d.getDate() - (Number(p) - 1)).getTime();
};

const KIND: Record<ShownKind, string> = {
  verses: N_('Біблія'),
  song: N_('Пісні'),
  doc: N_('Документи'),
  text: N_('Текст'),
  picture: N_('Зображення'),
  album: N_('Альбоми'),
  video: N_('Відео'),
  cover: N_('Заставка'),
  countdown: N_('Відлік'),
  qr: N_('QR для глядачів'),
};

/** 45 с · 12 хв · 1 год 5 хв */
function fmtSpan(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return tr('{n} с', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return tr('{n} хв', { n: m });
  return tr('{h} год {m} хв', { h: Math.floor(m / 60), m: m % 60 });
}
const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString(currentLocale(), opts);
};
const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(currentLocale());
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
const shows = (n: number) => trn(n, '{n} показ|{n} покази|{n} показів');

export function Stats() {
  useLang();
  const serverAvailable = useServer((s) => s.available);
  useEffect(() => {
    void probeServer();
    document.title = `VerseOrchestrator — ${tr('Статистика показу')}`;
  }, []);
  const [period, setPeriod] = useState<Period>('30');
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ['stats', period],
    queryFn: () => {
      const now = Date.now();
      return api.stats(periodFrom(period, now), now + 1);
    },
    enabled: serverAvailable === true,
    refetchInterval: 60_000,
  });
  const s = summary.data;

  return (
    <ScrollArea style={{ height: '100vh' }} type="auto">
      <Box maw={1100} mx="auto" px="md" py="lg">
        <Group justify="space-between" mb="md" gap="sm">
          <Group gap={8}>
            <IconChartBar size={22} />
            <Title order={4}>{tr('Статистика показу')}</Title>
          </Group>
          <Group gap="xs">
            <SegmentedControl
              size="xs"
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              data={[
                { value: '7', label: tr('7 днів') },
                { value: '30', label: tr('30 днів') },
                { value: '365', label: tr('Рік') },
                { value: 'all', label: tr('Усе') },
              ]}
            />
            <Button
              size="xs"
              variant="default"
              component="a"
              href={api.statsExportUrl(periodFrom(period, Date.now()), Date.now() + 1)}
              download
              leftSection={<IconDownload size={14} />}
              disabled={!s?.total.shows}
            >
              {tr('Експорт CSV')}
            </Button>
            <ClearStats
              disabled={!serverAvailable}
              onCleared={() => void queryClient.invalidateQueries({ queryKey: ['stats'] })}
            />
          </Group>
        </Group>

        {serverAvailable === false ? (
          <Paper withBorder p="md">
            <Text size="sm">
              {tr(
                'Статистику веде сервер застосунку. Запустіть застосунок (start.cmd, start.command або start.sh) — без нього, у режимі «у браузері», покази не записуються.',
              )}
            </Text>
          </Paper>
        ) : !s ? (
          summary.isError ? (
            <Text size="sm" c="red">
              {(summary.error as Error).message}
            </Text>
          ) : (
            <Loader size="sm" />
          )
        ) : s.total.shows === 0 && s.forgotten.length === 0 ? (
          <Paper withBorder p="md">
            <Text size="sm">
              {tr(
                'За цей час нічого не показано. Застосунок записує все, що виходить на екран: уривки, пісні, документи, зображення — з датою й тривалістю.',
              )}
            </Text>
          </Paper>
        ) : (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
              <Tile label={tr('Показів')} value={fmtNumber(s.total.shows)} />
              <Tile label={tr('На екрані')} value={fmtSpan(s.total.ms)} />
              <Tile label={tr('Днів із показом')} value={fmtNumber(s.total.days)} />
            </SimpleGrid>

            <Card
              title={
                period === '7' || period === '30' ? tr('Покази по днях') : tr('Покази по місяцях')
              }
            >
              <Columns summary={s} period={period} />
            </Card>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Card
                title={tr('Пісні')}
                empty={s.songs.length === 0 ? tr('Пісень за цей час не показували.') : null}
              >
                <BarList
                  rows={s.songs.slice(0, 15).map((x) => ({
                    key: x.songId,
                    label: x.label,
                    value: x.shows,
                    hint: tr('{shows}, на екрані {time}, востаннє {date}', {
                      shows: shows(x.shows),
                      time: fmtSpan(x.ms),
                      date: fmtDate(x.last),
                    }),
                  }))}
                />
                {s.forgotten.length > 0 && (
                  <>
                    <Text size="sm" fw={500} mt="md" mb={4}>
                      {tr('Давно не співали')}
                    </Text>
                    <Text size="xs" c="dimmed" mb={6}>
                      {tr('Пісні, які показували раніше, але не за останні вісім тижнів.')}
                    </Text>
                    <Stack gap={2}>
                      {s.forgotten.map((f) => (
                        <Group key={f.songId} justify="space-between" gap="xs" wrap="nowrap">
                          <Text size="sm" truncate>
                            {f.label}
                          </Text>
                          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                            {tr('{shows}, востаннє {date}', {
                              shows: shows(f.shows),
                              date: fmtDate(f.last),
                            })}
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  </>
                )}
              </Card>

              <Card
                title={tr('Книги Біблії')}
                empty={s.books.length === 0 ? tr('Уривків за цей час не показували.') : null}
              >
                <BookMap books={s.books} />
                {s.passages.length > 0 && (
                  <>
                    <Text size="sm" fw={500} mt="md" mb={6}>
                      {tr('Найчастіші уривки')}
                    </Text>
                    <BarList
                      rows={s.passages.slice(0, 10).map((p, i) => ({
                        key: i,
                        label: p.label,
                        value: p.shows,
                        hint: tr('{shows}, востаннє {date}', {
                          shows: shows(p.shows),
                          date: fmtDate(p.last),
                        }),
                      }))}
                    />
                  </>
                )}
              </Card>

              <Card
                title={tr('Документи')}
                empty={s.docs.length === 0 ? tr('Документів за цей час не показували.') : null}
              >
                <BarList
                  rows={s.docs.map((x) => ({
                    key: x.docId,
                    label: x.label,
                    value: x.shows,
                    hint: tr('{shows}, на екрані {time}, востаннє {date}', {
                      shows: shows(x.shows),
                      time: fmtSpan(x.ms),
                      date: fmtDate(x.last),
                    }),
                  }))}
                />
              </Card>

              <Card title={tr('Що показували')}>
                <BarList
                  rows={s.kinds.map((k) => ({
                    key: k.kind,
                    label: tr(KIND[k.kind]),
                    value: k.shows,
                    hint: tr('{shows}, на екрані {time}', {
                      shows: shows(k.shows),
                      time: fmtSpan(k.ms),
                    }),
                  }))}
                />
              </Card>
            </SimpleGrid>

            <DayReport days={s.days.map((d) => d.day)} />
          </Stack>
        )}
      </Box>
    </ScrollArea>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fz={26} fw={600} lh={1.2}>
        {value}
      </Text>
    </Paper>
  );
}

function Card({
  title,
  empty = null,
  children,
}: {
  title: string;
  empty?: string | null;
  children: React.ReactNode;
}) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" fw={600} mb="sm">
        {title}
      </Text>
      {empty ? (
        <Text size="sm" c="dimmed">
          {empty}
        </Text>
      ) : (
        children
      )}
    </Paper>
  );
}

/** Bars from one baseline, the number beside each; the hover says more. */
function BarList({
  rows,
}: {
  rows: { key: string | number; label: string; value: number; hint: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="vo-stat-bars">
      {rows.map((r) => (
        <Tooltip key={r.key} label={r.hint} openDelay={250} position="top-start">
          <div className="vo-stat-bar">
            <span className="vo-stat-bar-label">{r.label}</span>
            <span className="vo-stat-bar-track">
              <span className="vo-stat-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="vo-stat-bar-value">{fmtNumber(r.value)}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

/** The period's showings per day (a week, a month) or per month (a year, everything). */
function Columns({ summary, period }: { summary: StatsSummary; period: Period }) {
  useLang();
  const buckets = useMemo(() => {
    const byDay = new Map(summary.days.map((d) => [d.day, d]));
    const out: { key: string; label: string; shows: number; ms: number }[] = [];
    const now = new Date();
    if (period === '7' || period === '30') {
      for (let i = Number(period) - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = dayKey(d);
        const v = byDay.get(key);
        out.push({
          key,
          label: fmtDay(key, { day: 'numeric', month: 'short' }),
          shows: v?.shows ?? 0,
          ms: v?.ms ?? 0,
        });
      }
      return out;
    }
    const first =
      period === '365'
        ? new Date(now.getFullYear(), now.getMonth() - 11, 1)
        : summary.days.length
          ? new Date(
              Number(summary.days[0].day.slice(0, 4)),
              Number(summary.days[0].day.slice(5, 7)) - 1,
              1,
            )
          : new Date(now.getFullYear(), now.getMonth(), 1);
    for (let m = new Date(first); m <= now; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const prefix = dayKey(m).slice(0, 7);
      let shows = 0;
      let ms = 0;
      for (const d of summary.days)
        if (d.day.startsWith(prefix)) {
          shows += d.shows;
          ms += d.ms;
        }
      out.push({
        key: prefix,
        label: m.toLocaleDateString(currentLocale(), { month: 'short', year: '2-digit' }),
        shows,
        ms,
      });
    }
    return out;
  }, [summary, period]);
  const max = Math.max(1, ...buckets.map((b) => b.shows));
  const tick = Math.max(1, Math.ceil(buckets.length / 8));
  return (
    <div>
      <div className="vo-stat-cols" role="img" aria-label={tr('Покази по днях')}>
        {buckets.map((b) => (
          <Tooltip
            key={b.key}
            label={`${b.label}: ${b.shows ? `${shows(b.shows)}, ${fmtSpan(b.ms)}` : tr('без показів')}`}
            openDelay={100}
          >
            <div className="vo-stat-col">
              {b.shows > 0 && (
                <span
                  className="vo-stat-col-fill"
                  style={{ height: `${(b.shows / max) * 100}%` }}
                />
              )}
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="vo-stat-col-axis">
        {/* every tick-th, and the last — a tick too close to the last gives way (no overlap) */}
        {buckets.map((b, i) => {
          const last = i === buckets.length - 1;
          const shown = last || (i % tick === 0 && buckets.length - 1 - i >= tick);
          return (
            <span key={b.key} data-last={last || undefined}>
              {shown ? b.label : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The Bible's books as cells, the Old Testament then the New; the deeper the cell, the more it was
 * shown. Names from a translation in the interface's language when there is one.
 */
function BookMap({ books }: { books: StatsSummary['books'] }) {
  const lang = useLang();
  const translations = useQuery({ queryKey: ['translations'], queryFn: api.translations });
  const pick =
    translations.data?.find((t) => t.language.toLowerCase().startsWith(lang)) ??
    translations.data?.[0];
  const names = useQuery({
    queryKey: ['books', pick?.id],
    queryFn: () => api.books(pick!.id),
    enabled: pick !== undefined,
  });
  const by = new Map(books.map((b) => [b.book, b]));
  const list = names.data?.length
    ? names.data.map((b) => ({ n: b.bookNumber, short: b.shortName, long: b.longName }))
    : books.map((b) => ({ n: b.book, short: String(b.book), long: String(b.book) }));
  const max = Math.max(1, ...books.map((b) => b.shows));
  // MyBible's numbering: Matthew is 470
  const parts = [list.filter((b) => b.n < 470), list.filter((b) => b.n >= 470)];
  return (
    <Stack gap={6}>
      {parts.map((part, i) =>
        part.length === 0 ? null : (
          <div key={i} className="vo-stat-books">
            {part.map((b) => {
              const v = by.get(b.n);
              return (
                <Tooltip
                  key={b.n}
                  label={`${b.long}: ${v ? `${shows(v.shows)}, ${fmtSpan(v.ms)}` : tr('без показів')}`}
                  openDelay={100}
                >
                  <span
                    className="vo-stat-book"
                    data-zero={v ? undefined : 'true'}
                    data-deep={v && v.shows / max > 0.55 ? 'true' : undefined}
                    style={{ '--v': v ? 0.15 + 0.85 * (v.shows / max) : 0 } as React.CSSProperties}
                  >
                    {b.short}
                  </span>
                </Tooltip>
              );
            })}
          </div>
        ),
      )}
    </Stack>
  );
}

/** «Звіт показу»: one day, everything that was on screen, in order. */
function DayReport({ days }: { days: string[] }) {
  useLang();
  const newest = days[days.length - 1] ?? null;
  const [day, setDay] = useState<string | null>(newest);
  useEffect(() => {
    if (!day || !days.includes(day)) setDay(newest);
  }, [days, day, newest]);
  const report = useQuery({
    queryKey: ['stats-day', day],
    queryFn: () => api.statsDay(day!),
    enabled: day !== null,
    refetchInterval: 60_000,
  });
  if (!newest) return null;
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm" gap="xs">
        <Text size="sm" fw={600}>
          {tr('Звіт показу')}
        </Text>
        <Select
          size="xs"
          w={220}
          value={day}
          onChange={setDay}
          allowDeselect={false}
          aria-label={tr('День')}
          data={[...days]
            .reverse()
            .map((d) => ({ value: d, label: fmtDay(d, { dateStyle: 'full' }) }))}
        />
      </Group>
      {!report.data ? (
        <Loader size="xs" />
      ) : (
        <Table striped highlightOnHover fz="sm" verticalSpacing={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={70}>{tr('Час')}</Table.Th>
              <Table.Th w={120}>{tr('Що')}</Table.Th>
              <Table.Th />
              <Table.Th w={90} ta="right">
                {tr('Скільки')}
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {report.data.rows.map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td c="dimmed">{fmtTime(r.at)}</Table.Td>
                <Table.Td c="dimmed">{tr(KIND[r.kind])}</Table.Td>
                <Table.Td>
                  {r.label || (r.kind === 'text' ? r.detail : '')}
                  {r.by && (
                    <Text span size="xs" c="dimmed">
                      {' · '}
                      {tr('з пульта «{name}»', { name: r.by })}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {r.until === null ? tr('на екрані') : fmtSpan(r.until - r.at - r.gap)}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Paper>
  );
}

/** «Очистити статистику», asked once more beside the button (no dialog). */
function ClearStats({ disabled, onCleared }: { disabled: boolean; onCleared: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover opened={open} onChange={setOpen} position="bottom-end" withArrow>
      <Popover.Target>
        <Tooltip label={tr('Очистити статистику')}>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            aria-label={tr('Очистити статистику')}
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
          >
            <IconTrash size={14} />
          </Button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown maw={280}>
        <Text size="sm" mb="xs">
          {tr('Видалити всю статистику показу? Повернути її не вийде.')}
        </Text>
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="default" onClick={() => setOpen(false)}>
            {tr('Скасувати')}
          </Button>
          <Button
            size="xs"
            color="red"
            onClick={() => {
              setOpen(false);
              api
                .clearStats()
                .then(() => {
                  notifications.show({
                    message: tr('Статистику очищено'),
                    color: 'green',
                    autoClose: 1500,
                  });
                  onCleared();
                })
                .catch((e: Error) => notifications.show({ message: e.message, color: 'red' }));
            }}
          >
            {tr('Видалити')}
          </Button>
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}
