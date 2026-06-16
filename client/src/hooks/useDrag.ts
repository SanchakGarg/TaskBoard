import { useState, useCallback, useRef } from "react";

// Native HTML5 drag & drop for the kanban board. No library.

export interface DragData {
  taskId?: string;
  columnId?: string;
  fromColumn?: string;
}

export function useBoardDrag(
  onMove: (taskId: string, toColumn: string, position: number) => void,
  onColumnMove?: (columnId: string, toPosition: number) => void
) {
  const [dragging, setDragging] = useState<DragData | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [overColumnEdge, setOverColumnEdge] = useState<string | null>(null);
  
  // For column reordering ghosting
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const initialOrder = useRef<string[]>([]);

  const dragProps = useCallback(
    (taskId: string, fromColumn: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", taskId);
        setDragging({ taskId, fromColumn });
      },
      onDragEnd: () => {
        setDragging(null);
        setOverColumn(null);
      },
    }),
    []
  );

  const columnDragProps = useCallback(
    (columnId: string, currentOrder: string[]) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", columnId);
        setDragging({ columnId });
        initialOrder.current = currentOrder;
        setColumnOrder(currentOrder);
        
        // Add ghosting class to the dragged element
        const target = e.currentTarget as HTMLElement;
        setTimeout(() => target.classList.add("opacity-20"), 0);
      },
      onDragEnd: (e: React.DragEvent) => {
        setDragging(null);
        setOverColumnEdge(null);
        const target = e.currentTarget as HTMLElement;
        target.classList.remove("opacity-20");
      },
    }),
    []
  );

  const dropProps = useCallback(
    (columnId: string, taskCount: number, columnIndex: number) => ({
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        
        if (dragging?.taskId) {
          setOverColumn(columnId);
        } else if (dragging?.columnId && dragging.columnId !== columnId) {
          setOverColumnEdge(columnId);
          
          // Real-time reordering of columns
          setColumnOrder((prev) => {
            const filtered = prev.filter((id) => id !== dragging.columnId);
            const next = [...filtered];
            next.splice(columnIndex, 0, dragging.columnId!);
            return next;
          });
        }
      },
      onDragLeave: (e: React.DragEvent) => {
        if (e.currentTarget === e.target) {
          setOverColumn(null);
          setOverColumnEdge(null);
        }
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        if (dragging?.taskId) {
          onMove(dragging.taskId, columnId, taskCount);
        } else if (dragging?.columnId && onColumnMove) {
          onColumnMove(dragging.columnId, columnIndex);
        }
        setDragging(null);
        setOverColumn(null);
        setOverColumnEdge(null);
      },
    }),
    [dragging, onMove, onColumnMove]
  );

  return { dragging, overColumn, overColumnEdge, columnOrder, dragProps, columnDragProps, dropProps };
}
