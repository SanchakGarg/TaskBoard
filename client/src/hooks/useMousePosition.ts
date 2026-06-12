import { useRef, useCallback } from "react";

// Magnetic effect: element drifts toward the cursor by a small factor.
// Attach the returned handlers to any element; ~20 lines, no dependency.
export function useMagnetic<T extends HTMLElement>(strength = 0.05) {
  const ref = useRef<T>(null);

  const onMouseMove = useCallback(
    (e: React.MouseEvent<T>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - (rect.left + rect.width / 2);
      const y = e.clientY - (rect.top + rect.height / 2);
      el.style.transform = `translate(${x * strength * 4}px, ${y * strength * 4}px)`;
    },
    [strength]
  );

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = "";
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}
