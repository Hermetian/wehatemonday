import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/lib/utils/common';

interface SortableItemProps {
  id: string;
  label: string;
  isActive: boolean;
  order?: number;
  direction: 'asc' | 'desc';
  onDirectionChange: () => void;
}

export function SortableItem({
  id,
  label,
  isActive,
  order,
  direction,
  onDirectionChange,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center justify-between p-2 rounded-md',
        isDragging ? 'bg-accent/50' : isActive ? 'bg-accent/20' : 'hover:bg-accent/10',
        'transition-colors'
      )}
    >
      <div className="flex items-center gap-3">
        <button
          className="touch-none p-1 opacity-50 hover:opacity-100 cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex items-center gap-2">
          {isActive && order && (
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-accent/30 text-xs font-medium">
              {order}
            </span>
          )}
          {label}
        </span>
      </div>
      {isActive && (
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-auto"
          onClick={onDirectionChange}
        >
          {direction === 'desc' ? (
            <ArrowDown className="h-4 w-4" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
} 