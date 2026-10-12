import { Globe, List } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppView } from '@/lib/url-state';

interface ViewToggleProps {
  /** Active presentation (T3.3 URL state: `globe` default, `list` opt-in). */
  view?: AppView;
  /** Presentation-only switch — layer, search, severity, selection and data are untouched. */
  onViewChange?: (next: AppView) => void;
}

/**
 * Globe/list presentation toggle (T3.15). A quiet two-segment control in
 * the existing segmented-control language (same hairline container and
 * `aria-pressed` segments as `SeverityFilter`): no pills, no new toolbar,
 * no new dependency. Native buttons carry keyboard, touch and mouse
 * interaction; the shared `:focus-visible` ring is preserved (no outline
 * reset anywhere here). Labels collapse to icons below `sm` so the header
 * never overflows on narrow viewports — the accessible names stay.
 */
export default function ViewToggle({ view = 'globe', onViewChange }: ViewToggleProps) {
  const segment = (pressed: boolean) =>
    cn(
      'flex h-7 items-center gap-1 rounded-[5px] px-1.5 text-[11px] font-medium transition-colors duration-150',
      pressed
        ? 'bg-sentinel-accent/[0.13] text-sentinel-accent'
        : 'text-white/40 hover:bg-white/[0.05] hover:text-white/75',
    );

  return (
    <div role="group" aria-label="View" className="flex shrink-0 items-center gap-0.5 rounded-[7px] border border-white/[0.07] bg-white/[0.02] p-0.5">
      <button
        type="button"
        onClick={() => onViewChange?.('globe')}
        aria-pressed={view === 'globe'}
        aria-label="Globe view"
        className={segment(view === 'globe')}
      >
        <Globe className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Globe</span>
      </button>
      <button
        type="button"
        onClick={() => onViewChange?.('list')}
        aria-pressed={view === 'list'}
        aria-label="List view"
        className={segment(view === 'list')}
      >
        <List className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">List</span>
      </button>
    </div>
  );
}
