import { useState, useRef, useEffect } from 'react';
import { Search, Settings, HelpCircle, Globe } from 'lucide-react';
import { useSearch } from '@/hooks/useStats';

interface TopNavProps {
  onSearchResultClick: (lat: number, lon: number) => void;
  onSettingsClick: () => void;
}

export default function TopNav({ onSearchResultClick, onSettingsClick }: TopNavProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { results, loading, search } = useSearch();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (value.length >= 2) {
      search(value);
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  };

  const handleResultClick = (result: import('@/types').SearchResult) => {
    onSearchResultClick(result.lat, result.lon);
    setShowResults(false);
    setSearchQuery(result.name);
  };

  return (
    <nav 
      className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4"
      style={{ 
        height: 56, 
        background: 'rgba(2, 2, 2, 0.6)', 
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <Globe className="w-6 h-6 text-[#FFC31F]" />
        <span className="text-white font-semibold text-lg tracking-tight" style={{ fontFamily: 'Instrument Sans, sans-serif' }}>
          Earth Sentinel 3D
        </span>
      </div>

      {/* Center: Search */}
      <div ref={searchRef} className="relative" style={{ width: 300 }}>
        <div 
          className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200"
          style={{ 
            background: 'rgba(255,255,255,0.05)', 
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          onFocus={(e) => {
            (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,195,31,0.5)';
          }}
          onBlur={(e) => {
            (e.currentTarget as HTMLDivElement).style.border = '1px solid rgba(255,255,255,0.1)';
          }}
        >
          <Search className="w-4 h-4 text-white/40 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search locations, events..."
            className="bg-transparent text-white text-sm w-full outline-none placeholder:text-white/30"
            style={{ fontFamily: 'Instrument Sans, sans-serif' }}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
          />
        </div>

        {/* Search Results Dropdown */}
        {showResults && (
          <div 
            className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden"
            style={{ 
              background: 'rgba(15, 15, 20, 0.95)', 
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              maxHeight: 400,
              overflowY: 'auto',
            }}
          >
            {loading ? (
              <div className="p-4 text-white/40 text-sm text-center">Searching...</div>
            ) : results.length === 0 ? (
              <div className="p-4 text-white/40 text-sm text-center">No results found</div>
            ) : (
              results.map((result) => (
                <button
                  key={result.id}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 transition-colors hover:bg-white/5"
                  onClick={() => handleResultClick(result)}
                >
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: result.type === 'location' ? 'rgba(255,195,31,0.15)' : 'rgba(255,69,0,0.15)' }}
                  >
                    {result.type === 'location' ? (
                      <Globe className="w-4 h-4 text-[#FFC31F]" />
                    ) : (
                      <span className="text-xs text-orange-400">!</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-white text-sm truncate">{result.name}</div>
                    <div className="text-white/40 text-xs truncate">{result.snippet}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button 
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          onClick={onSettingsClick}
          aria-label="Settings"
        >
          <Settings className="w-5 h-5 text-white/70" />
        </button>
        <button 
          className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
          aria-label="Help"
        >
          <HelpCircle className="w-5 h-5 text-white/70" />
        </button>
      </div>
    </nav>
  );
}
