import { useState } from "react";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, className = "", disabled = false }: CheckboxProps) {
  const [justChecked, setJustChecked] = useState(false);

  const toggle = () => {
    if (disabled) return;
    if (!checked) {
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 400);
    }
    onChange(!checked);
  };

  return (
    <label className={`flex select-none items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={toggle}
        disabled={disabled}
        className={`anim-hover flex h-5 w-5 items-center justify-center rounded border-2 border-ink ${checked ? "bg-pen-green text-paper" : "bg-paper"} ${justChecked ? "anim-success" : ""} ${disabled ? "border-ink-soft bg-paper-dark" : ""}`}
      >
        {checked && <Check size={14} strokeWidth={3} />}
      </button>
      {label && (
        <span className={checked ? "text-ink-soft line-through" : ""} onClick={toggle}>
          {label}
        </span>
      )}
    </label>
  );
}
