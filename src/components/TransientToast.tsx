interface TransientToastProps {
  message: string | null;
  onClose: () => void;
}

export default function TransientToast({ message, onClose }: TransientToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[12000] flex justify-center px-4 sm:bottom-6">
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-accent/30 bg-slate-950/95 px-4 py-3 shadow-[0_30px_90px_-35px_rgba(0,0,0,0.9)] backdrop-blur"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-accent">{message}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:border-accent/40 hover:text-accent"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
