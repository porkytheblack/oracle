import catalogData from "../../data/catalog.json";

export interface ManifestEntry {
  id: string;
  title: string;
  source_ref: string;
  topics: string[];
  jurisdictions: string[];
  description: string;
  keywords: string[];
  last_verified: string;
}

export const manifest: ManifestEntry[] = catalogData as ManifestEntry[];

export function getManifestJSON(): string {
  return JSON.stringify(
    manifest.map(({ id, title, source_ref, topics, description, keywords }) => ({
      id,
      title,
      source_ref,
      topics,
      description,
      keywords,
    })),
    null,
    2
  );
}
