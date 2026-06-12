import { useState, useCallback } from "react";

// Native HTML5 drag & drop for the kanban board. No library.

export interface DragData {
  taskId: number;
  fromColumn: number;
}

export function useBoardDrag(onMove: (taskId: number, toColumn: number, position: number) => void) {
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [overColumn, setOverColumn] = useState<number | null>(null);

  const dragProps = useCallback(
    (taskId: number, fromColumn: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(taskId));
        setDragging({ taskId, fromColumn });
      },
      onDragEnd: () => {
        setDragging(null);
        setOverColumn(null);
      },
    }),
    []
  );

  const dropProps = useCallback(
    (columnId: number, taskCount: number) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOverColumn(columnId);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (e.currentTarget === e.target) setOverColumn(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragging) onMove(dragging.taskId, columnId, taskCount);
        setDragging(null);
        setOverColumn(null);
      },
    }),
    [dragging, onMove]
  );

  return { dragging, overColumn, dragProps, dropProps };
}
