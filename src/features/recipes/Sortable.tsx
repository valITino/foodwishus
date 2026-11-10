// A list whose rows can be dragged into a new order by their handle. Works with a
// finger, a mouse and the keyboard (space to pick up, arrows to move, space to drop).

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useCopy } from '../../i18n'
import { buzz, cx } from '../../ui/components'
import { LineIcon } from './parts'

const help = {
  en: { how: 'Press space to pick up. Use the arrow keys to move, space to drop, escape to cancel.' },
  de: { how: 'Mit der Leertaste aufnehmen. Mit den Pfeiltasten verschieben, mit der Leertaste ablegen, mit Escape abbrechen.' },
}

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

type HandleProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref: (element: HTMLElement | null) => void }

interface SortableListProps<T extends { key: string }> {
  items: T[]
  onMove: (from: number, to: number) => void
  /** Draw one row. Put <DragHandle {...handle} label="…" /> where the grip should be. */
  children: (item: T, index: number, handle: HandleProps) => ReactNode
  className?: string
  rowClassName?: string
}

export function SortableList<T extends { key: string }>({ items, onMove, children, className, rowClassName }: SortableListProps<T>) {
  const c = useCopy(help)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    buzz(6)
    if (!over || active.id === over.id) return
    const from = items.findIndex((item) => item.key === active.id)
    const to = items.findIndex((item) => item.key === over.id)
    if (from >= 0 && to >= 0) onMove(from, to)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={() => buzz(12)}
      onDragEnd={onDragEnd}
      accessibility={{ screenReaderInstructions: { draggable: c.how } }}
    >
      <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
        <ul className={className}>
          {items.map((item, index) => (
            <Row key={item.key} id={item.key} className={rowClassName}>
              {(handle) => children(item, index, handle)}
            </Row>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function Row({ id, className, children }: { id: string; className?: string; children: (handle: HandleProps) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cx('relative', className, isDragging && 'z-10 rounded-2xl bg-surface shadow-float')}
    >
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners } as HandleProps)}
    </li>
  )
}

/** The grip a row is dragged by. */
export function DragHandle({ label, className, ...handle }: HandleProps & { label: string }) {
  return (
    <button type="button" {...handle} aria-label={label} className={cx('grid h-12 w-11 shrink-0 cursor-grab touch-none place-items-center rounded-xl text-ink-soft', className)}>
      <LineIcon name="grip" size={20} />
    </button>
  )
}
