import { Thermometer, CloudRain, Cloud, Wind, Activity, AlertTriangle, Flame, Sparkles } from 'lucide-react';
import type { LayerId } from '@/types';

interface LayerPanelProps {
  activeLayer: LayerId | null;
  onLayerToggle: (layerId: LayerId) => void;
}

const LAYER_CONFIG: Array<{
  id: LayerId;
  icon: React.ReactNode;
  label: string;
}> = [
  { id: 'temperature', icon: <Thermometer className="w-5 h-5" />, label: 'Temperature' },
  { id: 'precipitation', icon: <CloudRain className="w-5 h-5" />, label: 'Precipitation' },
  { id: 'clouds', icon: <Cloud className="w-5 h-5" />, label: 'Cloud Cover' },
  { id: 'wind', icon: <Wind className="w-5 h-5" />, label: 'Wind' },
  { id: 'earthquakes', icon: <Activity className="w-5 h-5" />, label: 'Earthquakes' },
  { id: 'disasters', icon: <AlertTriangle className="w-5 h-5" />, label: 'Disasters' },
  { id: 'air_quality', icon: <Sparkles className="w-5 h-5" />, label: 'Air Quality' },
  { id: 'wildfires', icon: <Flame className="w-5 h-5" />, label: 'Wildfires' },
];

export default function LayerPanel({ activeLayer, onLayerToggle }: LayerPanelProps) {
  return (
    <div 
      className="fixed left-4 z-50 flex flex-col gap-2 rounded-2xl p-2"
      style={{ 
        top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(15, 15, 20, 0.7)', 
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {LAYER_CONFIG.map((layer) => {
        const isActive = activeLayer === layer.id;
        return (
          <button
            key={layer.id}
            onClick={() => onLayerToggle(layer.id)}
            className="relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 group"
            style={{
              background: isActive ? 'rgba(255,195,31,0.15)' : 'transparent',
              border: isActive ? '2px solid #FFC31F' : '2px solid transparent',
              boxShadow: isActive ? '0 0 12px rgba(255,195,31,0.3)' : 'none',
            }}
            title={layer.label}
            aria-label={`Toggle ${layer.label} layer`}
          >
            <div 
              className="transition-colors duration-200"
              style={{ color: isActive ? '#FFC31F' : 'rgba(255,255,255,0.5)' }}
            >
              {layer.icon}
            </div>
            
            {/* Hover glow */}
            <div 
              className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            />
            
            {/* Tooltip */}
            <div 
              className="absolute left-full ml-3 px-2 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
              style={{ 
                background: 'rgba(15, 15, 20, 0.9)', 
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {layer.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
