import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Text } from '@mantine/core';

interface VirtualListProps<T> {
  items: T[];
  getKey: (item: T) => string | number;
  renderRow: (item: T) => ReactNode;
  isSelected?: (item: T) => boolean;
  onSelect?: (item: T, e: React.MouseEvent | React.KeyboardEvent) => void;
  estimateSize?: number;
  rowClassName?: string;
  empty?: ReactNode;
}

/**
 * Lightweight virtualized list. Renders plain styled rows (not Mantine Buttons)
 * so long lists — books, chapters, verses — stay fast and feel like real lists.
 */
export function VirtualList<T>({
  items,
  getKey,
  renderRow,
  isSelected,
  onSelect,
  estimateSize = 32,
  rowClassName = 'vo-list-item',
  empty,
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 12,
  });

  if (items.length === 0 && empty) {
    return (
      <Text size="sm" c="dimmed" p="sm">
        {empty}
      </Text>
    );
  }

  return (
    <div ref={parentRef} style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          return (
            <div
              key={getKey(item)}
              className={rowClassName}
              role="button"
              tabIndex={0}
              data-selected={isSelected?.(item) ? 'true' : undefined}
              onClick={(e) => onSelect?.(item, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(item, e);
                }
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
              }}
            >
              {renderRow(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
