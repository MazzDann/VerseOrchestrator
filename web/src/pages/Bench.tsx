import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconChartBar, IconCopy, IconDownload, IconPlayerPlay } from '@tabler/icons-react';
import type { SegmentInfo } from '../api';
import { getManifest } from '../lib/engine/restore';
import { probeServer, useServer } from '../serverStore';
import { runBench } from '../lib/bench/run';
import {
  ENGINE_NAME,
  reportCsv,
  reportJson,
  type BenchEngine,
  type BenchReport,
  parity,
  type EngineRun,
} from '../lib/bench/report';
import { BENCH_CASES } from '../lib/bench/workload';

/** Segments picked by default: two translations (Ukrainian + Strong-tagged English), the
 * Strong's dictionary, cross-references — enough for every query in the workload. */
const DEFAULT_PICK = (s: SegmentInfo) =>
  (s.kind === 'translation' && ['UKRK', 'KJV+'].includes(s.abbr)) ||
  (s.kind === 'dictionary' && s.abbr === 'Strong') ||
  s.kind === 'study';

const KIND_LABEL: Record<SegmentInfo['kind'], string> = {
  translation: 'Переклади',
  dictionary: 'Словники',
  study: 'Посилання й коментарі',
  songs: 'Пісні',
};

const ms = (v: number | null | undefined) =>
  v == null || Number.isNaN(v)
    ? '—'
    : `${v.toLocaleString('uk-UA', { maximumFractionDigits: v < 10 ? 1 : 0 })} мс`;
const mb = (v: number | null | undefined) =>
  v == null ? '—' : `${(v / 1048576).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} МБ`;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A CSV file: UTF-8 with a BOM, or Excel opens the Cyrillic as mojibake. */
const saveCsv = (name: string, csv: string) =>
  download(name, String.fromCharCode(0xfeff) + csv, 'text/csv;charset=utf-8');

/**
 * «Порівняння рушіїв бази» (`/bench`): the hybrid-DB benchmark — server vs SQLite-WASM vs
 * PostgreSQL-WASM on the same segments and workload (lib/bench). Opened from
 * Налаштування → Застосунок; runs in its own window so the app's engine is untouched.
 */
export function Bench() {
  const serverAvailable = useServer((s) => s.available);
  const [manifest, setManifest] = useState<SegmentInfo[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [engines, setEngines] = useState<BenchEngine[]>(['sqlite', 'pglite']);
  const [iterations, setIterations] = useState(20);
  const [progress, setProgress] = useState<{ message: string; fraction: number } | null>(null);
  const [report, setReport] = useState<BenchReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void probeServer().then((ok) => {
      if (ok) setEngines((e) => (e.includes('server') ? e : ['server', ...e]));
    });
    getManifest()
      .then((m) => {
        setManifest(m.segments);
        setPicked(m.segments.filter(DEFAULT_PICK).map((s) => s.file));
      })
      .catch((e: Error) => setError(`Список сегментів недоступний: ${e.message}`));
  }, []);

  const chosen = manifest.filter((s) => picked.includes(s.file));
  const run = async () => {
    setReport(null);
    setError(null);
    setProgress({ message: '', fraction: 0 });
    try {
      const order: BenchEngine[] = (['server', 'sqlite', 'pglite'] as const).filter((e) =>
        engines.includes(e),
      );
      setReport(
        await runBench({
          engines: order,
          segments: chosen,
          iterations,
          onProgress: (message, fraction) => setProgress({ message, fraction }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const stamp = report?.createdAt.slice(0, 19).replace(/[:T]/g, '-');
  const copyCsv = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportCsv(report));
      notifications.show({ message: 'CSV скопійовано', color: 'green', autoClose: 1500 });
    } catch {
      saveCsv(`vo-bench-${stamp}.csv`, reportCsv(report));
    }
  };

  return (
    <ScrollArea style={{ height: '100vh' }} type="auto">
      <Box maw={1100} mx="auto" px="md" py="lg">
        <Group gap={8} mb={4}>
          <IconChartBar size={22} />
          <Title order={4}>Порівняння рушіїв бази</Title>
        </Group>
        <Text size="sm" c="dimmed" mb="md" maw={760}>
          Ті самі сегменти й ті самі запити на кожному рушії: сервер (SQLite через HTTP), SQLite у
          браузері й PostgreSQL у браузері (PGlite). Браузерні рушії запускаються начисто, по черзі,
          у власних воркерах — бібліотека застосунку не змінюється.
        </Text>

        <Paper withBorder p="md" mb="md">
          <Group align="flex-start" gap="xl" wrap="wrap">
            <Stack gap={6} style={{ minWidth: 260 }}>
              <Text size="sm" fw={500}>
                Сегменти
              </Text>
              <Checkbox.Group value={picked} onChange={setPicked}>
                <Stack gap={6}>
                  {(['translation', 'dictionary', 'study', 'songs'] as const).map((k) => {
                    const items = manifest.filter((s) => s.kind === k);
                    if (items.length === 0) return null;
                    return (
                      <div key={k}>
                        <Text size="xs" c="dimmed" mb={2}>
                          {KIND_LABEL[k]}
                        </Text>
                        <ScrollArea.Autosize mah={k === 'translation' ? 150 : undefined}>
                          <Stack gap={2}>
                            {items.map((s) => (
                              <Checkbox
                                key={s.file}
                                size="xs"
                                value={s.file}
                                label={
                                  <span>
                                    {s.abbr}{' '}
                                    <Text span size="xs" c="dimmed">
                                      {mb(s.rawBytes)}
                                    </Text>
                                  </span>
                                }
                              />
                            ))}
                          </Stack>
                        </ScrollArea.Autosize>
                      </div>
                    );
                  })}
                </Stack>
              </Checkbox.Group>
            </Stack>

            <Stack gap={6}>
              <Text size="sm" fw={500}>
                Рушії
              </Text>
              <Checkbox.Group value={engines} onChange={(v) => setEngines(v as BenchEngine[])}>
                <Stack gap={4}>
                  <Checkbox
                    size="xs"
                    value="server"
                    disabled={serverAvailable === false}
                    label={
                      serverAvailable === false
                        ? `${ENGINE_NAME.server} — сервер не запущено`
                        : ENGINE_NAME.server
                    }
                  />
                  <Checkbox size="xs" value="sqlite" label={ENGINE_NAME.sqlite} />
                  <Checkbox size="xs" value="pglite" label={ENGINE_NAME.pglite} />
                </Stack>
              </Checkbox.Group>
              <NumberInput
                size="xs"
                label="Повторів кожного запиту"
                value={iterations}
                onChange={(v) => setIterations(Math.max(5, Math.min(200, Number(v) || 20)))}
                min={5}
                max={200}
                w={200}
              />
            </Stack>

            <Stack gap={6} style={{ flex: 1, minWidth: 220 }}>
              <Button
                leftSection={<IconPlayerPlay size={16} />}
                disabled={!!progress || chosen.length === 0 || engines.length === 0}
                onClick={() => void run()}
              >
                Запустити
              </Button>
              {progress ? (
                <>
                  <Progress value={progress.fraction * 100} size="sm" animated />
                  <Text size="xs" c="dimmed">
                    {progress.message}
                  </Text>
                </>
              ) : (
                <Text size="xs" c="dimmed">
                  Кожен запит: перший (холодний) прохід, розігрів, далі {iterations} замірів —
                  медіана й p95. PostgreSQL завантажується довше: кілька секунд на переклад.
                </Text>
              )}
              {error && (
                <Text size="xs" c="orange">
                  {error}
                </Text>
              )}
            </Stack>
          </Group>
        </Paper>

        {report && (
          <ReportView
            report={report}
            onCsv={() => void copyCsv()}
            onSaveCsv={() => saveCsv(`vo-bench-${stamp}.csv`, reportCsv(report))}
            onSaveJson={() =>
              download(`vo-bench-${stamp}.json`, reportJson(report), 'application/json')
            }
          />
        )}
      </Box>
    </ScrollArea>
  );
}

function ReportView({
  report,
  onCsv,
  onSaveCsv,
  onSaveJson,
}: {
  report: BenchReport;
  onCsv: () => void;
  onSaveCsv: () => void;
  onSaveJson: () => void;
}) {
  const runs = report.engines;
  // results are compared with SQLite in the browser (same segments), else the first engine
  const base = runs.find((r) => r.engine === 'sqlite') ?? runs[0];
  const groups = useMemo(() => [...new Set(BENCH_CASES.map((c) => c.group))], []);

  const row = (label: string, cell: (r: EngineRun) => ReactNode, hint?: string) => (
    <Table.Tr>
      <Table.Td>
        <Text size="sm">{label}</Text>
        {hint && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </Table.Td>
      {runs.map((r) => (
        <Table.Td key={r.engine}>{r.error ? '—' : cell(r)}</Table.Td>
      ))}
    </Table.Tr>
  );
  const header = (title: string) => (
    <Table.Tr>
      <Table.Td colSpan={runs.length + 1} pt="md">
        <Text size="xs" c="dimmed" fw={600}>
          {title}
        </Text>
      </Table.Td>
    </Table.Tr>
  );

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Text size="sm" c="dimmed">
          {report.segments.map((s) => s.abbr).join(', ')} · {report.iterations} повторів ·{' '}
          {report.cores} ядер · v{report.app}
        </Text>
        <Group gap="xs">
          <Button size="xs" variant="default" leftSection={<IconCopy size={14} />} onClick={onCsv}>
            Копіювати CSV
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            onClick={onSaveCsv}
          >
            CSV
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDownload size={14} />}
            onClick={onSaveJson}
          >
            JSON
          </Button>
        </Group>
      </Group>

      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing={6} horizontalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: '32%' }} />
              {runs.map((r) => (
                <Table.Th key={r.engine}>
                  <Text size="sm" fw={600}>
                    {ENGINE_NAME[r.engine]}
                  </Text>
                  <Text size="xs" c="dimmed" fw={400}>
                    {r.error ? `Помилка: ${r.error}` : r.version}
                    {r.note ? ` · ${r.note}` : ''}
                  </Text>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {header('Рушій і дані')}
            {row('Запуск рушія', (r) => ms(r.bootMs), 'воркер, WebAssembly, ініціалізація бази')}
            {row(
              'Завантаження сегментів',
              (r) =>
                r.loadMs == null ? (
                  '—'
                ) : (
                  <>
                    <Text size="sm" fw={500}>
                      {ms(r.loadMs)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {r.segments.map((s) => `${s.abbr} ${ms(s.ms)}`).join(' · ')}
                    </Text>
                  </>
                ),
              'розпаковка, злиття, повнотекстовий індекс',
            )}
            {row('Розмір бази', (r) => mb(r.dbBytes), 'сервер — файл усієї бібліотеки')}
            {row('Пам’ять WebAssembly', (r) => mb(r.wasmBytes))}
            {row(
              'Файли рушія',
              (r) =>
                r.assets.length === 0
                  ? '—'
                  : r.assets.map((a) => `${a.name} ${mb(a.bodyBytes)}`).join(', '),
              'завантажені воркером (.wasm, .data)',
            )}
            {row(
              'Знімок бази: збереження',
              (r) => (r.snapshot ? `${ms(r.snapshot.dumpMs)} · ${mb(r.snapshot.dumpBytes)}` : '—'),
              'уся база одним образом',
            )}
            {row(
              'Знімок бази: відкриття',
              (r) => ms(r.snapshot?.reopenMs),
              'новий рушій з образу + перший запит',
            )}

            {groups.map((g) => (
              <Fragment key={g}>
                {header(g)}
                {BENCH_CASES.filter((c) => c.group === g).map((c) => {
                  const max = Math.max(
                    ...runs.map((r) => r.cases[c.id]?.medianMs ?? 0).filter(Number.isFinite),
                  );
                  return (
                    <Fragment key={c.id}>
                      {row(c.label, (r) => {
                        const s = r.cases[c.id];
                        if (!s)
                          return (
                            <Text size="xs" c="dimmed">
                              не застосовно
                            </Text>
                          );
                        if (s.error)
                          return (
                            <Text size="xs" c="orange">
                              {s.error}
                            </Text>
                          );
                        // the server has every translation — its list can't match
                        const p =
                          r === base || (c.id === 'translations' && r.engine === 'server')
                            ? null
                            : parity(s, base.cases[c.id]);
                        return (
                          <>
                            <Group gap={6} wrap="nowrap">
                              <Text size="sm" fw={500}>
                                {ms(s.medianMs)}
                              </Text>
                              {p && (
                                <Tooltip label={p.hint}>
                                  <Text
                                    size="xs"
                                    c={p.mark === '≠' ? 'orange' : 'dimmed'}
                                    style={{ cursor: 'help' }}
                                  >
                                    {p.mark}
                                  </Text>
                                </Tooltip>
                              )}
                            </Group>
                            <div
                              style={{
                                height: 3,
                                borderRadius: 2,
                                margin: '3px 0',
                                width: `${max > 0 ? Math.max(2, (s.medianMs / max) * 100) : 0}%`,
                                background: 'var(--mantine-color-brand-light-color)',
                                opacity: 0.6,
                              }}
                            />
                            <Text size="xs" c="dimmed">
                              p95 {ms(s.p95Ms)} · 1-й {ms(s.firstMs)} · {s.count}
                              {s.capped ? '+' : ''} рез.
                            </Text>
                          </>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" mt="sm">
        = ті самі результати, що в SQLite у браузері · ≈ обидва дійшли до межі 300 і по-різному
        впорядкували (bm25 / ts_rank) · сервер відповідає через HTTP (JSON включно) і тримає всю
        бібліотеку.
      </Text>
    </Paper>
  );
}
