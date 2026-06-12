import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const base =
  "anim-hover w-full rounded-lg border-2 border-ink-soft/40 bg-paper px-3 py-2 text-ink placeholder:text-ink-soft/60 focus:border-pen-blue focus:outline-none";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${base} ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${base} resize-y ${className}`} {...rest} />;
}
