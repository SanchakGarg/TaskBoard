import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 5000);
  }, [removeToast]);

  const success = (msg: string) => addToast(msg, "success");
  const error = (msg: string) => addToast(msg, "error");
  const info = (msg: string) => addToast(msg, "info");

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info }}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`anim-modal flex items-center gap-3 rounded-xl border-2 px-4 py-3 shadow-card-lift pointer-events-auto min-w-[280px] max-w-md ${
                t.type === "success" ? "border-pen-green bg-paper-dark text-ink" :
                t.type === "error" ? "border-pen-red bg-paper-dark text-ink" :
                "border-pen-blue bg-paper-dark text-ink"
              }`}
            >
              <span className="shrink-0">
                {t.type === "success" && <CheckCircle2 size={20} className="text-pen-green" />}
                {t.type === "error" && <AlertCircle size={20} className="text-pen-red" />}
                {t.type === "info" && <Info size={20} className="text-pen-blue" />}
              </span>
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="anim-hover -mr-1 rounded-md p-1 text-ink-soft hover:bg-paper hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
};

// Global singleton-ish access for non-component usage (like api.ts)
let toastInstance: ToastContextType | null = null;
export const setToastInstance = (instance: ToastContextType) => {
  toastInstance = instance;
};

export const showToast = (message: string, type: ToastType = "info") => {
  if (toastInstance) toastInstance.toast(message, type);
  else console.warn("Toast instance not set. Message:", message);
};
