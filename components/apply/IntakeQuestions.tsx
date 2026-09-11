'use client';

import { SUPPORT_CATEGORIES, SUPPORT_LABELS, type SupportCategory } from '@/lib/categories';

/** Non-identifying intake answers. There is deliberately no name, phone or address field. */
export type IntakeAnswers = { householdSize: number; supportCategory: SupportCategory | '' };

export default function IntakeQuestions({
  value,
  onChange,
}: {
  value: IntakeAnswers;
  onChange: (next: IntakeAnswers) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">How many people live in your household?</span>
        <input
          type="number"
          min={1}
          max={30}
          value={value.householdSize}
          onChange={(e) =>
            onChange({
              ...value,
              householdSize: Math.min(30, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">What kind of support do you need?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SUPPORT_CATEGORIES.map((c) => (
            <label
              key={c}
              className={`cursor-pointer rounded-lg px-3 py-2 text-sm ring-1 ${
                value.supportCategory === c
                  ? 'bg-emerald-50 ring-emerald-500'
                  : 'bg-white ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="supportCategory"
                value={c}
                checked={value.supportCategory === c}
                onChange={() => onChange({ ...value, supportCategory: c })}
                className="sr-only"
              />
              {SUPPORT_LABELS[c]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
