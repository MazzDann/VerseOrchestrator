import { Stack, Switch, Text } from '@mantine/core';
import { useSettings } from '../settingsStore';
import { PhoneLink } from './PhoneLink';

/**
 * Audience follow-along controls: a toggle that mirrors the live slide to the
 * server, plus a QR / URL viewers scan to read along on their phones.
 * Rendered inside a `FloatingPanel`.
 */
export function FollowPanel() {
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
        <PhoneLink
          path="/follow"
          caption="Відскануйте або відкрийте на телефоні (та сама мережа Wi-Fi):"
        />
      ) : (
        <Text size="xs" c="dimmed">
          Увімкніть, щоб показати QR-код. Працює в межах локальної мережі.
        </Text>
      )}
    </Stack>
  );
}
