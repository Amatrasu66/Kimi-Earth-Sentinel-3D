import type { ReactNode } from 'react';

interface AppShellProps {
  header: ReactNode;
  rail: ReactNode;
  stage: ReactNode;
  panel: ReactNode;
  status: ReactNode;
}

/**
 * Sentinel composition root. The shell owns the global grid —
 * header / workspace (rail | stage | panel) / status — plus all
 * geometry tokens. Children consume layout variables; nothing
 * positions itself with fixed offsets or magic numbers.
 *
 * The workspace is the page's `main` landmark (T3.10). `tabIndex={-1}`
 * makes it a programmatic focus target: skip link, panel close, and hint
 * dismissal restore focus here instead of dropping it to <body>.
 *
 * The WebGL/WebGPU canvas renders fixed behind this grid. The grid
 * itself is pointer-events-none; each island re-enables interaction.
 */
export default function AppShell({ header, rail, stage, panel, status }: AppShellProps) {
  const hasPanel = panel !== null && panel !== undefined && panel !== false;
  return (
    <div className="sentinel-shell">
      <div className="sentinel-shell-header">{header}</div>
      <main
        id="sentinel-workspace"
        tabIndex={-1}
        aria-label="Earth Sentinel workspace"
        className={hasPanel ? 'sentinel-workspace' : 'sentinel-workspace sentinel-workspace--no-panel'}
      >
        <div className="sentinel-rail-cell">{rail}</div>
        <div className="sentinel-stage-cell">{stage}</div>
        {hasPanel && <div className="sentinel-panel-cell">{panel}</div>}
      </main>
      <div className="sentinel-shell-status">{status}</div>
    </div>
  );
}
