// Returns today's date string (YYYY-MM-DD) in the Africa/Dar_es_Salaam timezone.
// 'en-CA' locale is used because it produces ISO 8601 date format (YYYY-MM-DD)
// natively, avoiding manual string assembly.
export function getTodayDarEsSalaam(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Converts a UTC ISO timestamp string to a YYYY-MM-DD date in the Africa/Dar_es_Salaam timezone.
// Use this when comparing stored UTC created_at values against the local "today" date.
export function getDateDarEsSalaam(isoString: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Dar_es_Salaam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoString));
}
