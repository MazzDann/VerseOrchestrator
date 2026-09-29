import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../api';
import { tr } from '../i18n';

/**
 * «Пересканувати модулі»: the server rebuilds the library from modules/ and songs/, then
 * every query reads it again. The settings panel and the «Бібліотеки ще немає» state
 * (0.13.1) share it.
 */
export function useRebuildLibrary(): { rebuilding: boolean; rebuild: () => Promise<void> } {
  const queryClient = useQueryClient();
  const [rebuilding, setRebuilding] = useState(false);
  const rebuild = async () => {
    setRebuilding(true);
    try {
      await api.rebuild();
      await queryClient.invalidateQueries();
      notifications.show({ message: tr('Бібліотеку оновлено'), color: 'green' });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося перебудувати бібліотеку: {error}', {
          error: (e as Error).message,
        }),
        color: 'red',
      });
    } finally {
      setRebuilding(false);
    }
  };
  return { rebuilding, rebuild };
}
