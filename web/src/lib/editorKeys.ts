import { type KeyboardEvent } from 'react';

/**
 * ⌘↩ / Ctrl+Enter typed in a running-order item's editor stays there (1.10.3, the Mac's round): the
 * page's «На екран» works in fields, so it put the old selection over the cover or the countdown —
 * as the search field (1.9.2) and «Назва програми» (1.9.6) keep theirs. The editors are portals:
 * React stops the native event at the portal's own container, before the page's listener.
 */
export function keepEnter(e: KeyboardEvent): void {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.stopPropagation();
}
