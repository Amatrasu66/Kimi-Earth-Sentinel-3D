/** Compact metric tile — tabular numerals, icon + label hierarchy. */
export default function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="sentinel-inset rounded-lg p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="sentinel-micro">{label}</span>
      </div>
      <div className="sentinel-mono text-[15px] font-semibold text-white">{value}</div>
    </div>
  );
}
