// Dynamic section loader — fetches from /api/sections/[id]
export interface SectionContent {
  id: string;
  content: string;
  word_count: number;
  has_table: boolean;
  has_list: boolean;
}

const sectionCache = new Map<string, SectionContent>();

export async function fetchSection(id: string): Promise<SectionContent | null> {
  if (sectionCache.has(id)) return sectionCache.get(id)!;
  try {
    const res = await fetch(`/api/sections/${id}`);
    if (!res.ok) return null;
    const data: SectionContent = await res.json();
    sectionCache.set(id, data);
    return data;
  } catch {
    return null;
  }
}

export async function fetchSections(ids: string[]): Promise<SectionContent[]> {
  const results = await Promise.all(ids.map(fetchSection));
  return results.filter(Boolean) as SectionContent[];
}
