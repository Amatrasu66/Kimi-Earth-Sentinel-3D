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
  /**
   * Single-key shortcuts enabled (T3.10 Settings toggle). The hint must
   * never advertise `1–8` while the map is switched off.
   */
  singleKeyShortcuts?: boolean;
}

/**
 * First-run affordance as an instrument annotation, not a card: a quiet
 * spine attached to the rail edge, small-caps title, two lines of micro
 * copy, text dismiss. T3.8: once a layer is auto-selected the copy guides
 * exploration (switch layers, globe, event details, search) instead of
 * telling the user to select a layer. Dismissal is persisted by the caller
 * (one-time hint); this component holds no storage state of its own.
 */
export default function LayerHint({ onDismiss, activeLayerName = null, singleKeyShortcuts = true }: LayerHintProps) {
  const hasLayer = activeLayerName !== null && activeLayerName !== undefined;

  return (
    <div
      // T3.9: below md the workspace stacks (stage / rail / panel) and the
      // panel is open on first run (default layer), so a bottom-anchored
      // hint would sit on top of the rail or the panel's own controls.
      // Anchor below the header instead: it overlays only globe stage area,
      // stays dismissible, and never covers rail/panel interactions. At md+
      // the rail column exists again, so the rail-centered annotation stays.
      className="panel-enter fixed left-4 top-[calc(var(--header-height)+8px)] z-40 w-max max-w-[220px] border-l-2 border-sentinel-accent/60 py-1 pl-3 pr-2
        md:left-[calc(var(--shell-padding)+var(--rail-width)+4px)] md:top-1/2 md:-translate-y-1/2"
      role="note"
      aria-label="Getting started hint"
    >
      {hasLayer ? (
        <>
          <p className="sentinel-label !text-white/70">Getting started</p>
          <p className="sentinel-micro mt-1 leading-relaxed">
            {activeLayerName} showing.{' '}
            {singleKeyShortcuts ? (
              <>
                Switch layers from the rail or press{' '}
                <span className="sentinel-mono text-white/60">1</span>–<span className="sentinel-mono text-white/60">8</span>,
                drag to explore, select an event for details, or search to fly anywhere.
              </>
            ) : (
              <>Switch layers from the rail, drag to explore, select an event for details, or search to fly anywhere.</>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="sentinel-label !text-white/70">Select layer</p>
          <p className="sentinel-micro mt-1 leading-relaxed">
            {singleKeyShortcuts ? (
              <>
                Choose an environmental layer from the rail, or press{' '}
                <span className="sentinel-mono text-white/60">1</span>–<span className="sentinel-mono text-white/60">8</span>.
              </>
            ) : (
              <>Choose an environmental layer from the rail.</>
            )}
          </p>
        </>
      )}
      <button
        onClick={onDismiss}
        aria-label="Dismiss getting started hint"
        className="sentinel-micro mt-1 text-white/40 underline-offset-2 transition-colors hover:text-white/80 hover:underline"
      >
        Dismiss
      </button>
    </div>
  );
}
