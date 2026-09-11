type Tone = 'emerald' | 'amber' | 'sky' | 'slate' | 'rose';

const TONES: Record<Tone, string> = {
  emerald: 'text-emerald-700',
  amber: 'text-amber-600',
  sky: 'text-sky-700',
  slate: 'text-slate-700',
  rose: 'text-rose-600',
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'slate',
  size = 'lg',
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: Tone;
  size?: 'lg' | 'sm';
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={`mt-1 font-semibold tabular-nums ${TONES[tone]} ${
          size === 'lg' ? 'text-4xl' : 'text-2xl'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
