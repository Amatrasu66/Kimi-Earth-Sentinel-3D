"use client";

import { X } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';

/**
 * First-run affordance: when no layer is active the globe stands alone and
 * newcomers may not discover the rail. One quiet hint, anchored to the rail
 * side on desktop and above the mobile strip on narrow screens. Vanishes on
 * first layer selection; dismissible for the session.
 */
export default function LayerHint({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="sentinel-floating panel-enter fixed z-40 flex max-w-[240px] items-start gap-2 rounded-xl p-3
        bottom-[128px] left-1/2 -translate-x-1/2
        md:bottom-auto md:left-[76px] md:top-1/2 md:-translate-x-0 md:-translate-y-1/2"
      role="note"
      aria-label="Getting started hint"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-white">Select a layer to begin</p>
        <p className="sentinel-micro mt-1 leading-relaxed">
          Pick an environmental layer from the rail, or press{' '}
          <Kbd className="border-white/10 bg-white/10 text-white/70">1</Kbd>–
          <Kbd className="border-white/10 bg-white/10 text-white/70">8</Kbd>.
        </p>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss hint"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
