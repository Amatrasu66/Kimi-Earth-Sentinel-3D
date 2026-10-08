"use client";

/**
 * First-run affordance as an instrument annotation, not a card: a quiet
 * spine attached to the rail edge, small-caps title, two lines of micro
 * copy, text dismiss. Vanishes on first layer selection.
 */
export default function LayerHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="panel-enter fixed z-40 w-max max-w-[220px] border-l-2 border-sentinel-accent/60 py-1 pl-3 pr-2
        bottom-[132px] left-1/2 -translate-x-1/2
        md:bottom-auto md:left-[calc(var(--shell-padding)+var(--rail-width)+4px)] md:top-1/2 md:-translate-x-0 md:-translate-y-1/2"
      role="note"
      aria-label="Getting started hint"
    >
      <p className="sentinel-label !text-white/70">Select layer</p>
      <p className="sentinel-micro mt-1 leading-relaxed">
        Choose an environmental layer from the rail, or press{' '}
        <span className="sentinel-mono text-white/60">1</span>–<span className="sentinel-mono text-white/60">8</span>.
      </p>
      <button
        onClick={onDismiss}
        className="sentinel-micro mt-1 text-white/40 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
