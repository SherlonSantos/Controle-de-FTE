export function extractLocation(description?: string | null, code?: string | null): string {
  if (!description && !code) return 'Não informada';
  if (!description) return code || 'Não informada';

  const clean = description.trim();
  const parts = clean.split('-').map(p => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    // e.g. "LIGHT - RJ - CASCADURA" or "1.1.16.1.02 LIGHT - REALENGO - RJ"
    if (parts[1].length === 2 && /^[A-Z]{2}$/i.test(parts[1])) {
      return `${parts[1].toUpperCase()} - ${parts.slice(2).join(' - ')}`;
    }
    return parts.slice(1).join(' - ');
  }

  if (parts.length === 2) {
    return parts[1];
  }

  return clean;
}

export function sortCompetences(comps: string[]): string[] {
  return [...comps].sort((a, b) => {
    const parseComp = (c: string) => {
      const p = c.split('/');
      if (p.length === 2) {
        return new Date(parseInt(p[1]), parseInt(p[0]) - 1, 1).getTime();
      }
      if (p.length === 3) {
        return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0])).getTime();
      }
      return 0;
    };
    return parseComp(a) - parseComp(b);
  });
}
