export function isDemobilized(competence?: string | null, demobDate?: Date | string | null): boolean {
  if (!demobDate) return false;
  if (!competence || !competence.includes('/')) return false;

  const [mmStr, yyyyStr] = competence.trim().split('/');
  const compMm = parseInt(mmStr, 10);
  const compYyyy = parseInt(yyyyStr, 10);
  if (isNaN(compMm) || isNaN(compYyyy)) return false;
  const compCode = compYyyy * 100 + compMm;

  let demobYear: number;
  let demobMonth: number;

  if (demobDate instanceof Date) {
    if (isNaN(demobDate.getTime())) return false;
    const iso = demobDate.toISOString();
    const [yStr, mStr] = iso.slice(0, 7).split('-');
    demobYear = parseInt(yStr, 10);
    demobMonth = parseInt(mStr, 10);
  } else if (typeof demobDate === 'string') {
    const match = demobDate.match(/^(\d{4})-(\d{2})/);
    if (match) {
      demobYear = parseInt(match[1], 10);
      demobMonth = parseInt(match[2], 10);
    } else {
      const parsed = new Date(demobDate);
      if (isNaN(parsed.getTime())) return false;
      const iso = parsed.toISOString();
      const [yStr, mStr] = iso.slice(0, 7).split('-');
      demobYear = parseInt(yStr, 10);
      demobMonth = parseInt(mStr, 10);
    }
  } else {
    return false;
  }

  const demobCode = demobYear * 100 + demobMonth;
  return compCode >= demobCode;
}
