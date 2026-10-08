/** Compact metric tile — flat, edge-aligned, tabular numerals. No card chrome. */
export default function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="min-w-0 px-0.5 py-1">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="sentinel-micro truncate">{label}</span>
      </div>
      <div className="sentinel-mono truncate text-[17px] font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}
