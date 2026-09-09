import { X, RotateCw, Zap, Eye, Database } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRotating: boolean;
  onToggleRotation: () => void;
}

interface SettingSection {
  title: string;
  icon: React.ReactNode;
  settings: Array<{
    label: string;
    description: string;
    type: 'toggle' | 'slider';
    value: boolean | number;
    onChange: (val: boolean | number) => void;
    disabled?: boolean;
    comingSoon?: boolean;
  }>;
}

export default function SettingsModal({ isOpen, onClose, isRotating, onToggleRotation }: SettingsModalProps) {
  const [cloudOpacity, setCloudOpacity] = useState(0.9);
  const [markerDensity, setMarkerDensity] = useState(100);
  const [atmosphereIntensity, setAtmosphereIntensity] = useState(1.0);
  const [showStars, setShowStars] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus management + Escape to close while the dialog is open.
  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sections: SettingSection[] = [
    {
      title: 'Globe',
      icon: <RotateCw className="w-4 h-4 text-[#FFC31F]" />,
      settings: [
        {
          label: 'Auto-rotate',
          description: 'Globe rotates automatically',
          type: 'toggle',
          value: isRotating,
          onChange: () => onToggleRotation(),
        },
        {
          label: 'Atmosphere',
          description: 'Atmospheric glow intensity — coming soon',
          type: 'slider',
          value: atmosphereIntensity,
          onChange: (val) => setAtmosphereIntensity(val as number),
          disabled: true,
          comingSoon: true,
        },
        {
          label: 'Cloud Opacity',
          description: 'Cloud layer transparency — coming soon',
          type: 'slider',
          value: cloudOpacity,
          onChange: (val) => setCloudOpacity(val as number),
          disabled: true,
          comingSoon: true,
        },
      ],
    },
    {
      title: 'Display',
      icon: <Eye className="w-4 h-4 text-[#FFC31F]" />,
      settings: [
        {
          label: 'Starfield',
          description: 'Show background stars — coming soon',
          type: 'toggle',
          value: showStars,
          onChange: () => setShowStars(!showStars),
          disabled: true,
          comingSoon: true,
        },
        {
          label: 'Marker Density',
          description: 'Number of visible markers — coming soon',
          type: 'slider',
          value: markerDensity,
          onChange: (val) => setMarkerDensity(val as number),
          disabled: true,
          comingSoon: true,
        },
      ],
    },
    {
      title: 'Data',
      icon: <Database className="w-4 h-4 text-[#FFC31F]" />,
      settings: [
        {
          label: 'Auto-refresh',
          description: 'Refresh data automatically — coming soon',
          type: 'toggle',
          value: true,
          onChange: () => {},
          disabled: true,
          comingSoon: true,
        },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative rounded-2xl overflow-hidden"
        style={{ 
          width: 480,
          maxHeight: '80vh',
          background: 'rgba(15, 15, 20, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#FFC31F]" />
            <h2 className="text-white font-medium" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>Settings</h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-[#FFC31F]"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 space-y-6" style={{ maxHeight: 'calc(80vh - 60px)' }}>
          {sections.map((section) => (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-3">
                {section.icon}
                <h3 className="text-white/70 text-sm font-medium">{section.title}</h3>
              </div>
              
              <div className="space-y-3">
                {section.settings.map((setting) => (
                  <div 
                    key={setting.label}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      opacity: setting.disabled ? 0.55 : 1,
                    }}
                  >
                    <div>
                      <div className="text-white text-sm">
                        {setting.label}
                        {setting.comingSoon && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide text-white/40 border border-white/10 rounded px-1.5 py-0.5">
                            Soon
                          </span>
                        )}
                      </div>
                      <div className="text-white/30 text-xs">{setting.description}</div>
                    </div>
                    
                    {setting.type === 'toggle' ? (
                      <button
                        onClick={() => setting.onChange(!setting.value)}
                        disabled={setting.disabled}
                        aria-disabled={setting.disabled}
                        className="relative w-10 h-6 rounded-full transition-colors disabled:cursor-not-allowed"
                        style={{
                          background: setting.value ? '#FFC31F' : 'rgba(255,255,255,0.1)',
                        }}
                      >
                        <div 
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                          style={{ 
                            left: 2,
                            transform: setting.value ? 'translateX(16px)' : 'translateX(0)',
                          }}
                        />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={typeof setting.value === 'number' && setting.label === 'Marker Density' ? 200 : 1}
                          step={0.01}
                          value={setting.value as number}
                          disabled={setting.disabled}
                          onChange={(e) => setting.onChange(parseFloat(e.target.value))}
                          className="w-24 accent-[#FFC31F] disabled:cursor-not-allowed"
                        />
                        <span className="text-white/40 text-xs w-10 text-right">
                          {typeof setting.value === 'number' 
                            ? setting.label === 'Marker Density' 
                              ? Math.round(setting.value) 
                              : `${Math.round((setting.value as number) * 100)}%`
                            : setting.value}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* About */}
          <div 
            className="rounded-xl p-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
          >
            <div className="text-white/40 text-xs mb-2">Earth Sentinel 3D v1.0.0</div>
            <div className="text-white/20 text-xs">
              Data sources: NASA EONET, USGS, NOAA, AirNow, Open-Meteo
            </div>
            <div className="text-white/20 text-xs mt-1">
              Earth textures: NASA Visible Earth (Blue Marble)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
