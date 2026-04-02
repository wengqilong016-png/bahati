// Returns today's date string (YYYY-MM-DD) in the Africa/Dar_es_Salaam timezone.
export function getTodayDarEsSalaam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
