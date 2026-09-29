import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Menu,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowsMove,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconExternalLink,
  IconFocus2,
  IconLayoutDashboard,
  IconMaximize,
  IconMinimize,
  IconScreenShare,
  IconX,
} from '@tabler/icons-react';
import { useSettings, type SavedOutput } from '../settingsStore';
import {
  OUTPUT_KIND_LABEL as KIND_LABEL,
  outputLabels,
  outputs,
  useOutputWindows,
  type OutputKind,
  type TrackedOutput,
} from '../lib/outputs';
import {
  listScreens,
  onScreensChange,
  screenOf,
  type ScreenAccess,
  type ScreenInfo,
} from '../lib/screens';
import {
  closeOutput,
  focusOutput,
  fullscreenOutput,
  moveOutput,
  openOutput,
  outputRef,
} from '../openPresenter';
import { N_, tr, trn, useLang } from '../i18n';

const KIND_ICON: Record<OutputKind, typeof IconScreenShare> = {
  presenter: IconScreenShare,
  stage: IconLayoutDashboard,
};

const NOT_OURS_FULLSCREEN = N_(
  'Відкрите з іншого вікна керування: на весь екран його переведе F або клік у самому вікні',
);

/**
 * «Вікна виводу» (0.4.2): the screens of this computer with «open here» buttons, the
 * output windows open right now (live, from their own announcements — lib/outputs.ts),
 * and the remembered layout. Rendered inside a FloatingPanel.
 */
export function OutputsPanel() {
  useLang();
  const windows = useOutputWindows();
  const windowsRef = useRef(windows);
  windowsRef.current = windows;
  const multiple = useSettings((s) => s.outputs.multiple);
  const fullscreen = useSettings((s) => s.outputs.fullscreen);
  const separate = useSettings((s) => s.outputs.separate);
  const layout = useSettings((s) => s.outputs.layout);
  const setOutputs = useSettings((s) => s.setOutputs);
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [access, setAccess] = useState<ScreenAccess>('prompt');

  const refresh = async (ask = false) => {
    const r = await listScreens(ask);
    setScreens(r.screens);
    setAccess(r.access);
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(
    () => (access === 'granted' ? onScreensChange(() => void refresh()) : undefined),
    [access],
  );

  const labels = outputLabels(windows);
  const opened = (ok: boolean, what: string) => {
    if (!ok) {
      notifications.show({
        message: separate
          ? tr(
              'Вікно не озвалося — можливо, браузер його заблокував: дозвольте спливні вікна для цього сайту',
            )
          : tr('Браузер заблокував вікно — дозвольте спливні вікна для цього сайту'),
        color: 'red',
      });
    } else {
      notifications.show({ message: what, color: 'brand', autoClose: 1500 });
    }
  };

  // Lends this click to the window (Chrome/Edge); elsewhere the window takes F itself.
  const setFullscreen = (o: TrackedOutput, on: boolean) => {
    if (!fullscreenOutput(o, on)) {
      notifications.show({
        message: tr('Цей браузер не передає жест іншому вікну — натисніть F у самому вікні'),
        color: 'orange',
      });
    }
  };

  // Without a reference the window focuses itself, which browsers may ignore: show its
  // number on it, so the operator at least sees which one it is.
  const focus = (o: TrackedOutput, label: string) => {
    if (!focusOutput(o)) outputs?.identify(o.id, label);
  };

  // The window closes itself; one that isn't a pop-up (opened by hand in a tab) may not.
  const close = (o: TrackedOutput, label: string) => {
    closeOutput(o);
    window.setTimeout(() => {
      if (windowsRef.current.some((w) => w.id === o.id)) {
        notifications.show({
          message: tr(
            '{window} не закрилося — браузер не дозволяє закрити його звідси. Закрийте вручну',
            { window: label },
          ),
          color: 'orange',
        });
      }
    }, 2000);
  };

  const openOn = async (kind: OutputKind, screen: ScreenInfo) => {
    const another = kind === 'presenter' && multiple && windows.some((o) => o.kind === kind);
    opened(await openOutput(kind, { screen, another }), `${tr(KIND_LABEL[kind])}: ${screen.label}`);
  };

  const saveLayout = () => {
    const saved: SavedOutput[] = windows.flatMap((o) => {
      const s = screenOf(o.bounds, screens);
      return s ? [{ kind: o.kind, screenKey: s.key, screenLabel: s.label }] : [];
    });
    setOutputs({ layout: saved });
    notifications.show({
      message: trn(
        saved.length,
        'Розкладку збережено: {n} вікно|Розкладку збережено: {n} вікна|Розкладку збережено: {n} вікон',
      ),
      color: 'green',
      autoClose: 1500,
    });
  };

  const openLayout = async () => {
    const { screens: now } = await listScreens(true);
    let ok = 0;
    const seen: Record<OutputKind, number> = { presenter: 0, stage: 0 };
    for (const item of layout) {
      const s =
        now.find((x) => x.key === item.screenKey) ?? now.find((x) => x.label === item.screenLabel);
      if (!s) continue;
      if (await openOutput(item.kind, { screen: s, another: seen[item.kind]++ > 0 })) ok++;
    }
    notifications.show(
      ok === layout.length
        ? { message: tr('Відкрито вікон: {n}', { n: ok }), color: 'green', autoClose: 1500 }
        : {
            message: tr(
              'Відкрито {ok} з {total}: частину заблокував браузер або екрана немає — дозвольте спливні вікна й повторіть',
              { ok, total: layout.length },
            ),
            color: 'orange',
          },
    );
  };

  return (
    <Stack gap="sm" p="sm">
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          {tr('Екрани')}
        </Text>
        {access === 'prompt' && (
          <Group gap="xs" wrap="nowrap" mb={6} align="flex-start">
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>
              {tr('Браузер покаже всі екрани й відкриватиме вікна на потрібному, якщо дозволите.')}
            </Text>
            <Button size="compact-xs" variant="light" onClick={() => void refresh(true)}>
              {tr('Показати екрани')}
            </Button>
          </Group>
        )}
        {access === 'denied' && (
          <Text size="xs" c="orange" mb={6}>
            {tr(
              'Доступ до екранів заборонено — дозвольте «Керування вікнами» в налаштуваннях сайту (значок ліворуч від адреси).',
            )}
          </Text>
        )}
        {access === 'unsupported' && (
          <Text size="xs" c="dimmed" mb={6}>
            {tr(
              'Цей браузер не повідомляє про екрани: вікна відкриваються там, де їх поставить браузер. Chrome і Edge уміють відкривати на вибраному екрані.',
            )}
          </Text>
        )}
        <Stack gap={4}>
          {screens.map((s) => {
            const here = windows.filter((o) => screenOf(o.bounds, screens)?.key === s.key).length;
            return (
              <Group key={s.key} gap={6} wrap="nowrap">
                <IconDeviceDesktop size={14} style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" truncate>
                    {s.label}{' '}
                    {s.primary && screens.length > 1 && (
                      <Badge size="xs" variant="light" color="gray">
                        {tr('основний')}
                      </Badge>
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {[
                      s.w && s.h ? `${s.w}×${s.h}` : null,
                      here ? tr('вікон: {n}', { n: here }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </div>
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() => void openOn('presenter', s)}
                >
                  {tr('Показ')}
                </Button>
                <Button size="compact-xs" variant="default" onClick={() => void openOn('stage', s)}>
                  {tr('Сцена')}
                </Button>
              </Group>
            );
          })}
        </Stack>
      </div>

      <Divider />

      <div>
        <Text size="xs" c="dimmed" mb={4}>
          {tr('Відкриті вікна')}
        </Text>
        {windows.length === 0 ? (
          <Text size="xs" c="dimmed">
            {tr('Вікон виводу не відкрито — відкрийте показ на потрібному екрані вище.')}
          </Text>
        ) : (
          <Stack gap={4}>
            {windows.map((o) => {
              const Icon = KIND_ICON[o.kind];
              const label = labels.get(o.id)!;
              // Move / close / focus go to the window itself (any control window); going
              // fullscreen needs our reference — a window this page opened, re-acquired
              // by name after a reload of this page (0.5.5).
              const canFullscreen = o.fullscreen || !!outputRef(o);
              const on = screenOf(o.bounds, screens);
              const state = [
                on?.label ?? tr('екран невідомий'),
                o.fullscreen ? tr('на весь екран') : `${o.bounds.w}×${o.bounds.h}`,
                o.visible ? null : tr('приховане'),
              ].filter(Boolean);
              return (
                <Group key={o.id} gap={6} wrap="nowrap">
                  <Icon size={14} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm">{label}</Text>
                    <Text size="xs" c={o.visible ? 'dimmed' : 'orange'} truncate>
                      {state.join(' · ')}
                    </Text>
                  </div>
                  <Tooltip label={tr('Показати номер на цьому вікні')}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={tr('Показати номер: {window}', { window: label })}
                      onClick={() => outputs?.identify(o.id, label)}
                    >
                      <IconFocus2 size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip
                    label={
                      !canFullscreen
                        ? tr(NOT_OURS_FULLSCREEN)
                        : o.fullscreen
                          ? tr('Вийти з повного екрана')
                          : tr('На весь екран (або F у вікні)')
                    }
                  >
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={`${o.fullscreen ? tr('Вийти з повного екрана') : tr('На весь екран')}: ${label}`}
                      disabled={!canFullscreen}
                      onClick={() => setFullscreen(o, !o.fullscreen)}
                    >
                      {o.fullscreen ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={tr('Перейти до вікна')}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={tr('Перейти до вікна: {window}', { window: label })}
                      onClick={() => focus(o, label)}
                    >
                      <IconExternalLink size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Menu position="bottom-end" withinPortal disabled={screens.length < 2}>
                    <Menu.Target>
                      <Tooltip
                        label={
                          screens.length < 2
                            ? tr('Інший екран не видно — дозвольте доступ до екранів')
                            : tr('Перенести на інший екран')
                        }
                      >
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          aria-label={tr('Перенести: {window}', { window: label })}
                          disabled={screens.length < 2}
                        >
                          <IconArrowsMove size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Menu.Target>
                    <Menu.Dropdown>
                      {screens.map((s) => (
                        <Menu.Item
                          key={s.key}
                          disabled={s.key === on?.key}
                          onClick={() => moveOutput(o, s)}
                        >
                          {s.label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                  <Tooltip label={tr('Закрити вікно')}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      aria-label={tr('Закрити: {window}', { window: label })}
                      onClick={() => close(o, label)}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              );
            })}
          </Stack>
        )}
      </div>

      <Divider />

      <Stack gap={6}>
        <Switch
          size="xs"
          checked={multiple}
          onChange={(e) => setOutputs({ multiple: e.currentTarget.checked })}
          label={tr('Кілька вікон показу')}
          description={tr('«Вікно показу» відкриває ще одне, а не повертає вже відкрите')}
        />
        <Switch
          size="xs"
          checked={fullscreen && !separate}
          disabled={separate}
          onChange={(e) => setOutputs({ fullscreen: e.currentTarget.checked })}
          label={tr('Відкривати на весь екран')}
          description={
            separate
              ? tr(
                  'З окремими процесами вікно стає на весь екран клавішею F або кліком у ньому самому',
                )
              : tr(
                  'Нове вікно стає на весь екран з вашим наступним кліком у цьому вікні — по одному вікну на клік (Chrome, Edge); в інших браузерах — F у самому вікні',
                )
          }
        />
        <Switch
          size="xs"
          checked={separate}
          onChange={(e) => setOutputs({ separate: e.currentTarget.checked })}
          label={tr('Окремий процес для кожного вікна')}
          description={tr(
            'Збій одного вікна виводу не зачепить вікно керування й інші вікна (Chrome, Edge). Діє для нових вікон; на весь екран — F або клік у самому вікні',
          )}
        />
        {/* natural widths: a narrow panel wraps them to two rows instead of cutting labels */}
        <Group gap="xs">
          <Button
            size="xs"
            variant="default"
            leftSection={<IconDeviceFloppy size={14} />}
            disabled={windows.length === 0}
            onClick={saveLayout}
          >
            {tr('Зберегти розкладку')}
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={layout.length === 0}
            onClick={() => void openLayout()}
          >
            {tr('Відкрити розкладку')}
            {layout.length ? ` (${layout.length})` : ''}
          </Button>
        </Group>
        {layout.length > 0 && (
          <Text size="xs" c="dimmed">
            {layout.map((l) => `${tr(KIND_LABEL[l.kind])} — ${l.screenLabel}`).join(' · ')}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
