"use client";

interface LayerHintProps {
  onDismiss: () => void;
  /**
   * Resolved display name of the selected layer (null = no layer).
   * The hint adapts: with a layer it guides exploration (never a
   * misleading "select a layer" instruction); without one it keeps the
   * original select-layer affordance.
   */
  activeLayerName?: string | null;
}

/**
 * First-run affordance as an instrument annotation, not a card: a quiet
 * spine attached to the rail edge, small-caps title, two lines of micro
 * copy, text dismiss. T3.8: once a layer is auto-selected the copy guides
 * exploration (switch layers, globe, event details, search) instead of
 * telling the user to select a layer. Dismissal is persisted by the caller
 * (one-time hint); this component holds no storage state of its own.
 */
export default function LayerHint({ onDismiss, activeLayerName = null }: LayerHintProps) {
  const hasLayer = activeLayerName !== null && activeLayerName !== undefined;

  return (
    <div
      className="panel-enter fixed z-40 w-max max-w-[220px] border-l-2 border-sentinel-accent/60 py-1 pl-3 pr-2
        bottom-[132px] left-1/2 -translate-x-1/2
        md:bottom-auto md:left-[calc(var(--shell-padding)+var(--rail-width)+4px)] md:top-1/2 md:-translate-x-0 md:-translate-y-1/2"
      role="note"
      aria-label="Getting started hint"
    >
      {hasLayer ? (
        <>
          <p className="sentinel-label !text-white/70">Getting started</p>
          <p className="sentinel-micro mt-1 leading-relaxed">
            {activeLayerName} showing. Switch layers from the rail or press{' '}
            <span className="sentinel-mono text-white/60">1</span>–<span className="sentinel-mono text-white/60">8</span>,
            drag to explore, select an event for details, or search to fly anywhere.
          </p>
        </>
      ) : (
        <>
          <p className="sentinel-label !text-white/70">Select layer</p>
          <p className="sentinel-micro mt-1 leading-relaxed">
            Choose an environmental layer from the rail, or press{' '}
            <span className="sentinel-mono text-white/60">1</span>–<span className="sentinel-mono text-white/60">8</span>.
          </p>
        </>
      )}
      <button
        onClick={onDismiss}
        className="sentinel-micro mt-1 text-white/40 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
