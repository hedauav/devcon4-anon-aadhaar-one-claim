const STEPS = ['Answer two questions', 'Prove eligibility', 'Submit'];

export default function StepHeader({ current }: { current: number }) {
  return (
    <ol className="flex gap-2 text-xs font-medium">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'active' : 'todo';
        return (
          <li
            key={label}
            className={`flex-1 rounded-lg px-3 py-2 ring-1 ${
              state === 'active'
                ? 'bg-emerald-600 text-white ring-emerald-600'
                : state === 'done'
                  ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                  : 'bg-white text-slate-500 ring-slate-200'
            }`}
          >
            {n}. {label}
          </li>
        );
      })}
    </ol>
  );
}
