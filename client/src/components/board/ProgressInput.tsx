import { Input } from "../ui";

interface ProgressInputProps {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
}

const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function ProgressInput({ value, onChange, compact = false }: ProgressInputProps) {
  const safeValue = clampProgress(value || 0);
  const fillStyle = {
    background: `linear-gradient(to right, var(--color-pen-blue) 0%, var(--color-pen-blue) ${safeValue}%, var(--color-paper-dark) ${safeValue}%, var(--color-paper-dark) 100%)`,
  };

  const setValue = (next: string) => {
    if (next.trim() === "") {
      onChange(0);
      return;
    }
    const parsed = Number(next);
    if (Number.isFinite(parsed)) onChange(clampProgress(parsed));
  };

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border-2 border-ink-soft/30 bg-paper-dark/40 px-2 py-1.5 ${
        compact ? "min-w-0 flex-1" : ""
      }`}
    >
      <span className="shrink-0 text-xs font-semibold text-ink-soft">Progress</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={safeValue}
        onChange={(e) => onChange(clampProgress(Number(e.target.value)))}
        aria-label="Task progress"
        style={fillStyle}
        className="progress-range min-w-0 flex-1"
      />
      <Input
        type="number"
        min={0}
        max={100}
        value={safeValue}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Task progress percentage"
        className="!w-14 !rounded-md !border-ink-soft/30 !bg-paper !px-1.5 !py-0.5 text-right text-sm"
      />
      <span className="text-xs text-ink-soft">%</span>
    </div>
  );
}
