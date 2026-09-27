import { Stack, Switch, Text } from '@mantine/core';
import { useSettings } from '../settingsStore';
import { PhoneLink } from './PhoneLink';

/** Ukrainian plural: 1 телефон, 2–4 телефони, 5+ телефонів (11–14 → телефонів). */
function plural(n: number, [one, few, many]: [string, string, string]): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

/**
 * Audience follow-along controls: a toggle that mirrors the live slide to the
 * server, plus a QR / URL viewers scan to read along on their phones.
 * Rendered inside a `FloatingPanel`.
 */
export function FollowPanel({ viewers }: { viewers: number }) {
  const followAlong = useSettings((s) => s.followAlong);
  const setFollowAlong = useSettings((s) => s.setFollowAlong);
  return (
    <Stack gap="sm" p="md">
      <Switch
        checked={followAlong}
        onChange={(e) => setFollowAlong(e.currentTarget.checked)}
        label="Трансляція на телефони глядачів"
        description="Поточний слайд дзеркалиться на сервер; глядачі читають за QR нижче."
      />
      {followAlong ? (
        <>
          <Text size="sm" fw={500}>
            {viewers === 0
              ? 'Поки ніхто не підключився'
              : `На зв’язку: ${viewers} ${plural(viewers, ['телефон', 'телефони', 'телефонів'])}`}
          </Text>
          <PhoneLink
            path="/follow"
            caption="Відскануйте або відкрийте на телефоні (та сама мережа Wi-Fi):"
          />
        </>
      ) : (
        <Text size="xs" c="dimmed">
          Увімкніть, щоб показати QR-код. Працює в межах локальної мережі.
        </Text>
      )}
    </Stack>
  );
}
