import { useState } from "react";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}

export function Checkbox({ checked, onChange, label, className = "" }: CheckboxProps) {
  const [justChecked, setJustChecked] = useState(false);

  const toggle = () => {
    if (!checked) {
      setJustChecked(true);
      setTimeout(() => setJustChecked(false), 400);
    }
    onChange(!checked);
  };

  return (
    <label className={`flex cursor-pointer select-none items-center gap-2 ${className}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={toggle}
        className={`anim-hover flex h-5 w-5 items-center justify-center rounded border-2 border-ink ${checked ? "bg-pen-green text-paper" : "bg-paper"} ${justChecked ? "anim-success" : ""}`}
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
