import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => new Date().toISOString().slice(0, 10);

interface DatePickerProps {
  value: string; // "" or YYYY-MM-DD
  onChange: (value: string) => void;
  compact?: boolean;
}

// App-styled calendar picker — replaces the native date input.
export function DatePicker({ value, onChange, compact = false }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = value ? new Date(value + "T00:00:00") : new Date();
  const [month, setMonth] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const startWeekday = (first.getDay() + 6) % 7;
  const dateStr = (day: number) => `${month.y}-${pad(month.m + 1)}-${pad(day)}`;
  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`anim-hover flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${value ? "border-pen-blue/60 text-pen-blue" : "border-ink-soft/40 text-ink-soft hover:border-ink hover:text-ink"} ${compact ? "" : "px-2 py-1 text-sm"}`}
      >
        <CalendarDays size={compact ? 11 : 14} />
        {value || "Due date"}
        {value && (
          <X
            size={11}
            className="hover:text-pen-red"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          />
        )}
      </button>

      {open && (
        <div className="anim-modal absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border-2 border-ink bg-paper p-2 shadow-card-lift">
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="anim-hover cursor-pointer rounded p-1 hover:bg-paper-dark"
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-hand text-sm font-bold">
              {first.toLocaleString("default", { month: "long" })} {month.y}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              className="anim-hover cursor-pointer rounded p-1 hover:bg-paper-dark"
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i} className="py-0.5 text-ink-soft">
                {d}
              </span>
            ))}
            {Array.from({ length: startWeekday }).map((_, i) => (
              <span key={`p${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ds = dateStr(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(ds);
                    setOpen(false);
                  }}
                  className={`anim-hover cursor-pointer rounded py-1 hover:bg-paper-dark ${ds === todayStr() ? "sketch-border font-bold" : ""} ${ds === value ? "bg-ink text-paper" : ""}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
