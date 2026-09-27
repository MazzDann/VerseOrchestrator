import { useEffect, useState } from 'react';
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
} from '../lib/outputs';
import {
  listScreens,
  onScreensChange,
  screenOf,
  type ScreenAccess,
  type ScreenInfo,
} from '../lib/screens';
import {
  adoptOutput,
  closeOutput,
  focusOutput,
  fullscreenOutput,
  moveOutput,
  openOutput,
} from '../openPresenter';

const KIND_ICON: Record<OutputKind, typeof IconScreenShare> = {
  presenter: IconScreenShare,
  stage: IconLayoutDashboard,
};

const NOT_OURS = 'Це вікно відкрите не з цього вікна керування — керуйте ним там';

/**
 * «Вікна виводу» (1.3.2): the screens of this computer with «open here» buttons, the
 * output windows open right now (live, from their own announcements — lib/outputs.ts),
 * and the remembered layout. Rendered inside a FloatingPanel.
 */
export function OutputsPanel() {
  const windows = useOutputWindows();
  const multiple = useSettings((s) => s.outputs.multiple);
  const fullscreen = useSettings((s) => s.outputs.fullscreen);
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
  const opened = (w: Window | null, what: string) => {
    if (!w) {
      notifications.show({
        message: 'Браузер заблокував вікно — дозвольте спливні вікна для цього сайту',
        color: 'red',
      });
    } else {
      notifications.show({ message: what, color: 'brand', autoClose: 1500 });
    }
  };

  // Lends this click to the window (Chrome/Edge); elsewhere the window takes F itself.
  const setFullscreen = (name: string, on: boolean) => {
    if (!fullscreenOutput(name, on)) {
      notifications.show({
        message: 'Цей браузер не передає жест іншому вікну — натисніть F у самому вікні',
        color: 'orange',
      });
    }
  };

  const openOn = async (kind: OutputKind, screen: ScreenInfo) => {
    const another = kind === 'presenter' && multiple && windows.some((o) => o.kind === kind);
    opened(await openOutput(kind, { screen, another }), `${KIND_LABEL[kind]}: ${screen.label}`);
  };

  const saveLayout = () => {
    const saved: SavedOutput[] = windows.flatMap((o) => {
      const s = screenOf(o.bounds, screens);
      return s ? [{ kind: o.kind, screenKey: s.key, screenLabel: s.label }] : [];
    });
    setOutputs({ layout: saved });
    notifications.show({
      message: `Розкладку збережено: ${saved.length} вікн.`,
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
      const w = await openOutput(item.kind, { screen: s, another: seen[item.kind]++ > 0 });
      if (w) ok++;
    }
    notifications.show(
      ok === layout.length
        ? { message: `Відкрито вікон: ${ok}`, color: 'green', autoClose: 1500 }
        : {
            message: `Відкрито ${ok} з ${layout.length}: частину заблокував браузер або екрана немає — дозвольте спливні вікна й повторіть`,
            color: 'orange',
          },
    );
  };

  return (
    <Stack gap="sm" p="sm">
      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Екрани
        </Text>
        {access === 'prompt' && (
          <Group gap="xs" wrap="nowrap" mb={6} align="flex-start">
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>
              Браузер покаже всі екрани й відкриватиме вікна на потрібному, якщо дозволите.
            </Text>
            <Button size="compact-xs" variant="light" onClick={() => void refresh(true)}>
              Показати екрани
            </Button>
          </Group>
        )}
        {access === 'denied' && (
          <Text size="xs" c="orange" mb={6}>
            Доступ до екранів заборонено — дозвольте «Керування вікнами» в налаштуваннях сайту
            (значок ліворуч від адреси).
          </Text>
        )}
        {access === 'unsupported' && (
          <Text size="xs" c="dimmed" mb={6}>
            Цей браузер не повідомляє про екрани: вікна відкриваються там, де їх поставить браузер.
            Chrome і Edge уміють відкривати на вибраному екрані.
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
                        основний
                      </Badge>
                    )}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {[s.w && s.h ? `${s.w}×${s.h}` : null, here ? `вікон: ${here}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </div>
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() => void openOn('presenter', s)}
                >
                  Показ
                </Button>
                <Button size="compact-xs" variant="default" onClick={() => void openOn('stage', s)}>
                  Сцена
                </Button>
              </Group>
            );
          })}
        </Stack>
      </div>

      <Divider />

      <div>
        <Text size="xs" c="dimmed" mb={4}>
          Відкриті вікна
        </Text>
        {windows.length === 0 ? (
          <Text size="xs" c="dimmed">
            Вікон виводу не відкрито — відкрийте показ на потрібному екрані вище.
          </Text>
        ) : (
          <Stack gap={4}>
            {windows.map((o) => {
              const Icon = KIND_ICON[o.kind];
              const label = labels.get(o.id)!;
              // A window this page didn't open (control reloaded, or taken over from
              // another control window) is re-acquired by its name — it is open: it beats.
              const ours = !!adoptOutput(o.name);
              const on = screenOf(o.bounds, screens);
              const state = [
                on?.label ?? 'екран невідомий',
                o.fullscreen ? 'на весь екран' : `${o.bounds.w}×${o.bounds.h}`,
                o.visible ? null : 'приховане',
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
                  <Tooltip label="Показати номер на цьому вікні">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={`Показати номер: ${label}`}
                      onClick={() => outputs?.identify(o.id, label)}
                    >
                      <IconFocus2 size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip
                    label={
                      !ours
                        ? NOT_OURS
                        : o.fullscreen
                          ? 'Вийти з повного екрана'
                          : 'На весь екран (або F у вікні)'
                    }
                  >
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={`${o.fullscreen ? 'Вийти з повного екрана' : 'На весь екран'}: ${label}`}
                      disabled={!ours}
                      onClick={() => setFullscreen(o.name, !o.fullscreen)}
                    >
                      {o.fullscreen ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={ours ? 'Перейти до вікна' : NOT_OURS}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={`Перейти до вікна: ${label}`}
                      disabled={!ours}
                      onClick={() => focusOutput(o.name)}
                    >
                      <IconExternalLink size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Menu position="bottom-end" withinPortal disabled={!ours || screens.length < 2}>
                    <Menu.Target>
                      <Tooltip
                        label={
                          !ours
                            ? NOT_OURS
                            : screens.length < 2
                              ? 'Інший екран не видно — дозвольте доступ до екранів'
                              : 'Перенести на інший екран'
                        }
                      >
                        <ActionIcon
                          variant="subtle"
                          size="sm"
                          aria-label={`Перенести: ${label}`}
                          disabled={!ours || screens.length < 2}
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
                          onClick={() => moveOutput(o.name, s)}
                        >
                          {s.label}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                  <Tooltip label={ours ? 'Закрити вікно' : NOT_OURS}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      aria-label={`Закрити: ${label}`}
                      disabled={!ours}
                      onClick={() => closeOutput(o.name)}
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
          label="Кілька вікон показу"
          description="«Вікно показу» відкриває ще одне, а не повертає вже відкрите"
        />
        <Switch
          size="xs"
          checked={fullscreen}
          onChange={(e) => setOutputs({ fullscreen: e.currentTarget.checked })}
          label="Відкривати на весь екран"
          description="Нове вікно стає на весь екран з вашим наступним кліком у цьому вікні — по одному вікну на клік (Chrome, Edge); в інших браузерах — F у самому вікні"
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
            Зберегти розкладку
          </Button>
          <Button
            size="xs"
            variant="light"
            disabled={layout.length === 0}
            onClick={() => void openLayout()}
          >
            Відкрити розкладку{layout.length ? ` (${layout.length})` : ''}
          </Button>
        </Group>
        {layout.length > 0 && (
          <Text size="xs" c="dimmed">
            {layout.map((l) => `${KIND_LABEL[l.kind]} — ${l.screenLabel}`).join(' · ')}
          </Text>
        )}
      </Stack>
    </Stack>
  );
}
