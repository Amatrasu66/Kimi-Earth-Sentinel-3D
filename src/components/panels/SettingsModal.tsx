"use client";

import { useState, useEffect } from 'react';
import { RotateCw, Activity, Keyboard, Info } from 'lucide-react';
import { api, getApiConfig } from '@/services/api';
import { hasNavigatorGpu, probeWebGpuSupport } from '@/lib/webgpu';
import { useIsMobile } from '@/hooks/use-mobile';
import type { RendererInfo } from '@/components/globe/EarthRenderer';
import type { DataStatus, LayerId } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/kbd';
import { statusLabel } from '@/lib/format';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRotating: boolean;
  onToggleRotation: () => void;
  rendererInfo?: RendererInfo;
  activeLayer?: LayerId | null;
  dataStatus?: DataStatus | null;
}

/**
 * Lightweight production diagnostic (Settings → Diagnostics).
 * Shows only safe values: configured API base, backend health + latency,
 * current layer/provenance, and renderer capability. Never any secret.
 */
function DiagnosticsPanel({
  rendererInfo,
  activeLayer,
  dataStatus,
}: {
  rendererInfo?: RendererInfo;
  activeLayer?: LayerId | null;
  dataStatus?: DataStatus | null;
}) {
  const [health, setHealth] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);
  const [webgpuProbe, setWebgpuProbe] = useState<string>('checking…');
  const config = getApiConfig();

  useEffect(() => {
    let cancelled = false;
    probeWebGpuSupport().then((support) => {
      if (!cancelled) {
        setWebgpuProbe(support.supported ? `supported (${support.reason})` : `unsupported (${support.reason})`);
      }
    });
    if (config.error || !config.base) return;
    const started = performance.now();
    api
      .getHealth()
      .then((payload) => {
        if (cancelled) return;
        setHealth(`ok · ${payload.service} v${payload.version}`);
        setLatencyMs(Math.round(performance.now() - started));
        setLastOk(new Date().toISOString());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setHealth(`unreachable · ${err instanceof Error ? err.message : 'request failed'}`);
      });
    return () => {
      cancelled = true;
    };
    // Fetch once per dialog open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Array<[string, string]> = [
    ['API base', config.base || 'not configured'],
    ['API source', `${config.source}${config.isProduction ? ' · production build' : ' · dev build'}`],
    ['Backend health', config.error ? config.error : (health ?? 'checking…')],
    ['API latency', latencyMs === null ? '—' : `${latencyMs} ms`],
    ['Last success', lastOk ?? '—'],
    ['Current layer', activeLayer ?? 'none'],
    ['Data status', dataStatus ? `${statusLabel(dataStatus)} · ${dataStatus.source}` : 'no layer data'],
    ['WebGPU', `${hasNavigatorGpu() ? 'navigator.gpu present' : 'no navigator.gpu'} · probe ${webgpuProbe}`],
    ['Active renderer', rendererInfo ? `${rendererInfo.active} · ${rendererInfo.detail}` : 'unknown'],
    ['Renderer source', rendererInfo ? rendererInfo.source : '—'],
    ['Earth textures', rendererInfo ? `${rendererInfo.textures.loaded}/${rendererInfo.textures.total} loaded` : '—'],
    [
      'WebGPU frames',
      rendererInfo?.active === 'webgpu'
        ? (rendererInfo.frames !== undefined
            ? `${rendererInfo.frames} submitted — scene is rendering`
            : '0 — loop has not submitted a frame yet')
        : 'n/a (WebGL path)',
    ],
  ];

  return (
    <dl className="sentinel-inset space-y-1.5 rounded-lg p-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="sentinel-micro flex-shrink-0">{label}</dt>
          <dd className="break-all text-right text-xs text-white/80">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const SHORTCUTS: Array<{ keys: string[]; action: string }> = [
  { keys: ['1', '…', '8'], action: 'Toggle environmental layers' },
  { keys: ['Space'], action: 'Pause / resume globe rotation' },
  { keys: ['/'], action: 'Focus search' },
  { keys: ['↑', '↓', '↵'], action: 'Navigate & fly to search results' },
  { keys: ['Esc'], action: 'Close results → back to layer → close panel' },
];

function SettingsBody({
  isRotating,
  onToggleRotation,
  rendererInfo,
  activeLayer,
  dataStatus,
}: Omit<SettingsModalProps, 'isOpen' | 'onClose'>) {
  return (
    <Tabs defaultValue="globe" className="min-h-0 gap-0">
      <div className="border-b border-white/[0.07] px-4 pt-2.5">
        <TabsList className="h-8 border border-white/10 bg-white/[0.04] p-0.5" aria-label="Settings sections">
          <TabsTrigger value="globe" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">Globe</TabsTrigger>
          <TabsTrigger value="shortcuts" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">
            <Keyboard className="h-3.5 w-3.5" /> Shortcuts
          </TabsTrigger>
          <TabsTrigger value="diagnostics" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">
            <Activity className="h-3.5 w-3.5" /> Diagnostics
          </TabsTrigger>
          <TabsTrigger value="about" className="h-7 px-3 text-xs data-[state=active]:bg-sentinel-accent/15 data-[state=active]:text-sentinel-accent">
            <Info className="h-3.5 w-3.5" /> About
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="max-h-[55vh] overflow-y-auto overscroll-contain p-4">
        <TabsContent value="globe" className="mt-0 space-y-3">
          <div className="sentinel-inset flex items-center justify-between gap-3 rounded-lg p-3">
            <div className="flex items-start gap-2.5">
              <RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-sentinel-accent" aria-hidden />
              <div>
                <Label htmlFor="sentinel-rotate" className="text-[13px] font-medium text-white">Auto-rotate</Label>
                <p className="sentinel-micro mt-0.5">Globe rotates when idle. Also toggled with <Kbd className="border-white/10 bg-white/10 text-white/60">Space</Kbd>.</p>
              </div>
            </div>
            <Switch id="sentinel-rotate" checked={isRotating} onCheckedChange={onToggleRotation} aria-label="Toggle globe auto-rotation" className="data-[state=checked]:bg-sentinel-accent" />
          </div>
          <div className="sentinel-inset rounded-lg p-3">
            <p className="sentinel-micro leading-relaxed">
              Display theme is fixed to the dark command theme so the Earth stays the visual centerpiece.
              Renderer status is always visible in the bottom bar.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="border-white/10 bg-white/5 text-[11px] text-white/60">
                {rendererInfo ? `${rendererInfo.active} · ${rendererInfo.detail}` : 'renderer…'}
              </Badge>
              {activeLayer && (
                <Badge variant="secondary" className="border-sentinel-accent/25 bg-sentinel-accent/[0.08] text-[11px] text-sentinel-accent">
                  {activeLayer}
                </Badge>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="shortcuts" className="mt-0">
          <ul className="sentinel-inset divide-y divide-white/[0.05] rounded-lg px-3">
            {SHORTCUTS.map((s) => (
              <li key={s.action} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-[13px] text-white/75">{s.action}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k} className="border-white/10 bg-white/[0.07] text-white/70">{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="sentinel-micro mt-2.5 leading-relaxed">Shortcuts are ignored while typing. Press Esc to blur the search field.</p>
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-0">
          <DiagnosticsPanel rendererInfo={rendererInfo} activeLayer={activeLayer} dataStatus={dataStatus} />
        </TabsContent>

        <TabsContent value="about" className="mt-0 space-y-3">
          <div className="sentinel-inset rounded-lg p-3">
            <div className="sentinel-section-title text-white">Earth Sentinel 3D v1.0.0</div>
            <Separator className="my-2 bg-white/[0.07]" />
            <p className="sentinel-micro leading-relaxed">Data sources: NASA EONET, USGS, NOAA, AirNow, Open-Meteo</p>
            <p className="sentinel-micro mt-1 leading-relaxed">Earth textures: NASA Visible Earth (Blue Marble)</p>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}

// Centered dialog on desktop, bottom sheet on narrow screens — same content,
// same tab logic, no behavior fork.
export default function SettingsModal({ isOpen, onClose, isRotating, onToggleRotation, rendererInfo, activeLayer, dataStatus }: SettingsModalProps) {
  const isMobile = useIsMobile();
  const bodyProps = { isRotating, onToggleRotation, rendererInfo, activeLayer, dataStatus };

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="bottom"
          className="gap-0 p-0"
          aria-describedby={undefined}
        >
          <SheetHeader className="border-b border-white/[0.07]">
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription>Globe behavior, shortcuts, and diagnostics.</SheetDescription>
          </SheetHeader>
          <SettingsBody {...bodyProps} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="sentinel-panel max-h-[85vh] w-[520px] gap-0 overflow-hidden border-white/10 bg-sentinel-panel p-0 text-white sm:max-w-[520px]"
        aria-describedby={undefined}
      >
        <DialogHeader className="border-b border-white/[0.07] px-4 py-3 text-left">
          <DialogTitle className="sentinel-section-title text-white">Settings</DialogTitle>
          <DialogDescription className="sentinel-micro">Globe behavior, shortcuts, and diagnostics.</DialogDescription>
        </DialogHeader>
        <SettingsBody {...bodyProps} />
      </DialogContent>
    </Dialog>
  );
}
