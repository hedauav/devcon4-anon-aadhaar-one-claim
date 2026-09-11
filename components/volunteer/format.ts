const dateTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

export function formatTime(ms: number | null): string {
  return ms === null ? '—' : dateTime.format(new Date(ms));
}
