import { useEffect } from 'react';
import { ORDER_CURRENT_KEY } from '../../lib/stage';

/**
 * «Сцена»'s running-order strip (1.9.0-beta.11): the item on screen, written by the control window
 * in charge under its own key (lib/stage.ts ORDER_CURRENT_KEY) — the stage window reads it and
 * hears its storage event. A window that waits leaves it to the leader.
 */
export function useOrderCurrentMirror({
  isLeader,
  currentId,
}: {
  isLeader: boolean;
  currentId: string | null;
}) {
  useEffect(() => {
    if (!isLeader) return;
    try {
      if (currentId) localStorage.setItem(ORDER_CURRENT_KEY, currentId);
      else localStorage.removeItem(ORDER_CURRENT_KEY);
    } catch {
      /* a blocked storage: «Сцена» shows the order from its start */
    }
  }, [isLeader, currentId]);
}
