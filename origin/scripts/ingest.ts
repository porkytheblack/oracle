/**
 * Ingestion script — converts vasp-act-registry.json into:
 *   - data/catalog.json  (manifest for LLM section selection)
 *   - data/sections/{id}.json (full content per section)
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface SectionManifestEntry {
  id: string;
  title: string;
  source_ref: string;
  topics: string[];
  jurisdictions: string[];
  description: string;
  keywords: string[];
  last_verified: string;
}

interface SectionContent {
  id: string;
  content: string;
  word_count: number;
  has_table: boolean;
  has_list: boolean;
}

const DATA_DIR = join(__dirname, "..", "data");
const SECTIONS_DIR = join(DATA_DIR, "sections");
const REGISTRY_PATH = join(__dirname, "..", "..", "doc", "vasp-act-registry.json");

function flattenContent(obj: any, depth = 0): string {
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map((v) => flattenContent(v, depth)).join("\n");

  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "title") continue; // handled separately
    if (typeof value === "string") {
      if (key === "content" || key === "preamble" || key === "description") {
        lines.push(value);
      } else if (key.match(/^[a-z]$/) || key.match(/^[ivx]+$/)) {
        lines.push(`(${key}) ${value}`);
      } else if (key !== "title") {
        lines.push(`${key}: ${value}`);
      }
    } else if (typeof value === "object" && value !== null) {
      const nested = flattenContent(value, depth + 1);
      if (key === "content" || key === "preamble" || key === "description") {
        lines.push(nested);
      } else if (key === "definitions" || key === "designated_authorities" || key === "principles" || key === "subsections") {
        lines.push(nested);
      } else if (key.match(/^[a-z]$/) || key.match(/^[ivx]+$/) || key.match(/^\d+$/)) {
        const content = (value as any).content || (value as any).description || "";
        if (content) lines.push(`(${key}) ${content}`);
        const sub = flattenContent(
          Object.fromEntries(Object.entries(value as any).filter(([k]) => k !== "content" && k !== "description")),
          depth + 1
        );
        if (sub.trim()) lines.push(sub);
      } else {
        lines.push(flattenContent(value, depth + 1));
      }
    }
  }
  return lines.filter(Boolean).join("\n");
}

function topicsFromPart(partKey: string, sectionKey: string, title: string): string[] {
  const t = title.toLowerCase();
  const topics: string[] = [];
  if (partKey === "part_1") topics.push("definitions", "scope");
  if (partKey === "part_2") topics.push("governance", "registration");
  if (partKey === "part_3") topics.push("licensing", "registration");
  if (partKey === "part_4") topics.push("governance");
  if (partKey === "part_5") topics.push("aml", "reporting");
  if (partKey === "part_6") topics.push("governance");
  if (partKey === "part_7") topics.push("penalties");
  if (partKey === "part_8") topics.push("penalties");
  if (partKey === "part_9") topics.push("governance");
  if (partKey === "part_10") topics.push("scope");
  if (t.includes("licence") || t.includes("licensing")) topics.push("licensing");
  if (t.includes("penalty") || t.includes("penalties") || t.includes("offence")) topics.push("penalties");
  if (t.includes("anti-money") || t.includes("aml")) topics.push("aml");
  return [...new Set(topics)];
}

function descriptionFromTitle(title: string, partTitle: string): string {
  return `${title} — under ${partTitle} of the Virtual Asset Service Providers Act (Kenya).`;
}

function extractKeywords(content: string): string[] {
  const freq: Record<string, number> = {};
  const stops = new Set(["the", "of", "a", "an", "and", "or", "in", "to", "for", "is", "are", "be", "by", "this", "that", "with", "from", "on", "at", "as", "it", "its", "has", "have", "shall", "may", "under", "any", "such", "not", "who", "which", "other", "person", "section"]);
  content.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).forEach((w) => {
    if (w.length > 3 && !stops.has(w)) freq[w] = (freq[w] || 0) + 1;
  });
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w);
}

function main() {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  const manifest: SectionManifestEntry[] = [];
  const sections: SectionContent[] = [];

  mkdirSync(SECTIONS_DIR, { recursive: true });

  // Process parts
  for (const [partKey, part] of Object.entries(registry.parts) as [string, any][]) {
    for (const [sectionNum, section] of Object.entries(part.sections) as [string, any][]) {
      const id = `vasp-s${sectionNum}`;
      const title = `Section ${sectionNum} — ${section.title}`;
      const content = `${title}\n\n${flattenContent(section)}`;
      const wordCount = content.split(/\s+/).length;

      manifest.push({
        id,
        title,
        source_ref: `Section ${sectionNum}`,
        topics: topicsFromPart(partKey, sectionNum, section.title),
        jurisdictions: ["KE"],
        description: descriptionFromTitle(section.title, part.title),
        keywords: extractKeywords(content),
        last_verified: "2025-11",
      });

      const sectionContent: SectionContent = {
        id,
        content,
        word_count: wordCount,
        has_table: content.includes("|"),
        has_list: /^\s*[\(\d(i]/m.test(content),
      };

      sections.push(sectionContent);
      writeFileSync(join(SECTIONS_DIR, `${id}.json`), JSON.stringify(sectionContent, null, 2));
    }
  }

  // Process schedules
  if (registry.schedules) {
    for (const [schedKey, sched] of Object.entries(registry.schedules) as [string, any][]) {
      const id = `vasp-${schedKey.replace(/_/g, "-")}`;
      const content = `${sched.title}\n\n${flattenContent(sched)}`;
      const wordCount = content.split(/\s+/).length;

      manifest.push({
        id,
        title: sched.title,
        source_ref: schedKey.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        topics: schedKey.includes("first") ? ["licensing", "scope"] : ["scope"],
        jurisdictions: ["KE"],
        description: `${sched.title} of the VASP Act.`,
        keywords: extractKeywords(content),
        last_verified: "2025-11",
      });

      const sectionContent: SectionContent = {
        id,
        content,
        word_count: wordCount,
        has_table: content.includes("|"),
        has_list: /^\s*[\(\d(i]/m.test(content),
      };

      sections.push(sectionContent);
      writeFileSync(join(SECTIONS_DIR, `${id}.json`), JSON.stringify(sectionContent, null, 2));
    }
  }

  // Write manifest
  writeFileSync(join(DATA_DIR, "catalog.json"), JSON.stringify(manifest, null, 2));
  console.log(`Ingested ${manifest.length} sections into data/catalog.json`);
}

main();
