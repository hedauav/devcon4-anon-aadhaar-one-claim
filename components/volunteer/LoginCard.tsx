export function LoginCard({ error }: { error?: string }) {
  return (
    <div className="mx-auto max-w-sm rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h1 className="text-xl font-semibold text-slate-900">Volunteer sign-in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Enter the office passphrase to review this cycle&apos;s applications.
      </p>
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <form method="post" action="/api/volunteer/login" className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Passphrase
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
