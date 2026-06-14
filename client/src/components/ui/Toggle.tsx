import { useState } from "react";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, disabled = false, className = "" }: ToggleProps) {
  const [justToggled, setJustChecked] = useState(false);

  const toggle = () => {
    if (disabled) return;
    setJustChecked(true);
    setTimeout(() => setJustChecked(false), 400);
    onChange(!checked);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={toggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-ink transition-colors duration-200 ease-in-out outline-none 
        ${checked ? "bg-pen-green" : "bg-paper-dark"} 
        ${disabled ? "cursor-not-allowed opacity-50" : "hover:border-pen-blue"} 
        ${justToggled ? "anim-success" : ""} 
        ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full border-2 border-ink bg-paper shadow ring-0 transition duration-200 ease-in-out 
          ${checked ? "translate-x-5" : "translate-x-1"} 
          ${checked ? "mt-[1px]" : "mt-[1px]"}`}
      />
    </button>
  );
}
