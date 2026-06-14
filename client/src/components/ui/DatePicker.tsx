import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

interface DatePickerProps {
  value: string; // "" or YYYY-MM-DD or YYYY-MM-DD HH:mm
  onChange: (value: string) => void;
  compact?: boolean;
}

export function DatePicker({ value, onChange, compact = false }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const [datePart, timePart] = value.split(" ");
  const [hours, mins] = (timePart || "00:00").split(":").map(Number);

  // Parse as local date
  let initial = new Date();
  if (datePart) {
    const [y, m, d] = datePart.split("-").map(Number);
    initial = new Date(y!, m! - 1, d!);
  }
  const [month, setMonth] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  const MENU_W = 224;
  const MENU_H = 320; // taller for time picker

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      left: Math.min(rect.left, window.innerWidth - MENU_W - 8),
      top: Math.min(rect.bottom + 4, window.innerHeight - MENU_H - 8),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
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

  const updateTime = (h: number, m: number) => {
    if (!datePart) return;
    const t = `${pad(h)}:${pad(m)}`;
    onChange(`${datePart} ${t}`);
  };

  const hasTime = !!timePart && timePart !== "00:00";

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`anim-hover flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${
          value 
            ? (hasTime ? "border-pen-red/60 text-pen-red" : "border-pen-blue/60 text-pen-blue") 
            : "border-ink-soft/40 text-ink-soft hover:border-ink hover:text-ink"
        } ${compact ? "" : "px-2 py-1 text-sm"}`}
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

      {open &&
        pos &&
        createPortal(
        <div
          ref={menuRef}
          data-popover
          style={{ position: "fixed", left: pos.left, top: pos.top, width: MENU_W, zIndex: 110 }}
          className="anim-modal flex flex-col gap-3 rounded-lg border-2 border-ink bg-paper p-2 shadow-card-lift"
        >
          <div>
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
                      onChange(ds + (timePart ? ` ${timePart}` : " 00:00"));
                    }}
                    className={`anim-hover cursor-pointer rounded py-1 hover:bg-paper-dark ${ds === todayStr() ? "sketch-border font-bold" : ""} ${ds === datePart ? "bg-ink text-paper" : ""}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 border-t-2 border-ink/5 pt-2">
            <Clock size={14} className="text-ink-soft" />
            <div className="flex flex-1 items-center justify-center gap-1">
              <select
                value={hours}
                onChange={(e) => updateTime(Number(e.target.value), mins!)}
                disabled={!datePart}
                className="cursor-pointer rounded bg-paper-dark px-1 py-0.5 text-xs font-bold outline-none"
              >
                {Array.from({ length: 24 }).map((_, i) => (
                  <option key={i} value={i}>{pad(i)}</option>
                ))}
              </select>
              <span className="font-bold">:</span>
              <select
                value={mins}
                onChange={(e) => updateTime(hours!, Number(e.target.value))}
                disabled={!datePart}
                className="cursor-pointer rounded bg-paper-dark px-1 py-0.5 text-xs font-bold outline-none"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                  <option key={m} value={m}>{pad(m)}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="anim-hover rounded bg-ink px-2 py-0.5 text-xs font-bold text-paper hover:opacity-80"
            >
              OK
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
