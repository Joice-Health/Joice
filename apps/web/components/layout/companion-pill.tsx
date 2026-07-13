/** Floating "Companion" entry point, shared by all main-site pages. */
export function CompanionPill() {
  return (
    <button
      type="button"
      className="glass fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-ink shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_14px_34px_-14px_rgba(31,38,32,0.4)] transition-all duration-200 hover:bg-white/75"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
      </span>
      Companion · ask anything
    </button>
  );
}
