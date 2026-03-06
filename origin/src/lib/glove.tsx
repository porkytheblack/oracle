"use client";

import { GloveClient, defineTool } from "glove-react";
import type { ToolConfig } from "glove-react";
import { z } from "zod";
import { getManifestJSON, manifest } from "./catalog";
import { fetchSection, fetchSections } from "./sections";
import { useSectionViewer } from "./section-viewer";

// ── selectAndFetch: internal orchestrator tool ──
const selectAndFetchTool: ToolConfig = {
  name: "selectAndFetch",
  description:
    "Select relevant sections from the VASP Act catalog and fetch their full text. Use this when the user asks a question about the VASP Act. Returns the full text of selected sections for synthesis.",
  inputSchema: z.object({
    selected_ids: z
      .array(z.string())
      .describe("Array of section IDs from the manifest to fetch"),
    rationale: z
      .record(z.string(), z.string())
      .describe("Map of section ID to reason for selection"),
  }),
  async do(input) {
    const sections = await fetchSections(input.selected_ids);
    if (sections.length === 0) {
      return {
        status: "error" as const,
        data: "No sections found for the given IDs.",
        message: "No sections found",
      };
    }
    const sectionData = sections.map((s) => ({
      id: s.id,
      title: manifest.find((m) => m.id === s.id)?.title ?? s.id,
      content: s.content,
    }));
    return {
      status: "success" as const,
      data: JSON.stringify(sectionData),
      renderData: { sections: sectionData, rationale: input.rationale },
    };
  },
};

// ── renderSourceCard: shows cited sections inline ──
const renderSourceCardTool = defineTool({
  name: "renderSourceCard",
  description:
    "Render source citation cards for sections that were referenced in the answer. Call this after answering, passing the section IDs that were cited.",
  inputSchema: z.object({
    citations: z.array(
      z.object({
        id: z.string().describe("Section ID"),
        title: z.string().describe("Section title"),
        excerpt: z.string().describe("A short excerpt (1-2 sentences) from the section"),
      })
    ),
  }),
  displayPropsSchema: z.object({
    citations: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        excerpt: z.string(),
      })
    ),
  }),
  displayStrategy: "stay" as const,
  async do(input, display) {
    await display.pushAndForget({ citations: input.citations });
    return {
      status: "success" as const,
      data: `Rendered ${input.citations.length} source card(s).`,
      renderData: { citations: input.citations },
    };
  },
  render({ props }) {
    return <SourceCardStrip citations={props.citations} />;
  },
  renderResult({ data }) {
    const { citations } = data as {
      citations: { id: string; title: string; excerpt: string }[];
    };
    return <SourceCardStrip citations={citations} />;
  },
});

function SourceCardStrip({
  citations,
}: {
  citations: { id: string; title: string; excerpt: string }[];
}) {
  return (
    <div className="mt-3">
      <div className="font-mono text-[9px] text-text-muted tracking-widest uppercase mb-2 flex items-center gap-2">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-text-muted">
          <rect x="1" y="1" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
          <line x1="3" y1="4" x2="7" y2="4" stroke="currentColor" strokeWidth="0.8" />
          <line x1="3" y1="6" x2="6" y2="6" stroke="currentColor" strokeWidth="0.8" />
        </svg>
        {citations.length} source{citations.length !== 1 ? "s" : ""} cited
      </div>
      <div className="source-card-scroll flex gap-2.5 overflow-x-auto pb-2">
        {citations.map((c) => (
          <SourceCard key={c.id} id={c.id} title={c.title} excerpt={c.excerpt} />
        ))}
      </div>
    </div>
  );
}

function SourceCard({
  id,
  title,
  excerpt,
}: {
  id: string;
  title: string;
  excerpt: string;
}) {
  const { open } = useSectionViewer();

  const handleClick = async () => {
    // Try to fetch full section content
    const section = await fetchSection(id);
    open({
      id,
      title,
      content: section?.content ?? excerpt,
    });
  };

  return (
    <button
      onClick={handleClick}
      className="source-card text-left border border-border rounded-lg bg-surface hover:bg-surface-2 hover:border-oracle/30 p-3.5 w-[240px] min-w-[240px] font-mono transition-all group cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-oracle tracking-wider uppercase">
          {id}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className="text-text-muted group-hover:text-oracle transition-colors shrink-0"
        >
          <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="text-[12px] text-text-primary font-medium mb-1.5 leading-snug line-clamp-2">
        {title}
      </div>
      <div className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
        {excerpt}
      </div>
    </button>
  );
}

// ── renderComparisonTable ──
const renderComparisonTableTool = defineTool({
  name: "renderComparisonTable",
  description:
    "Render a comparison table when the user asks about differences, comparisons, or multi-item breakdowns. Provide structured table data.",
  inputSchema: z.object({
    title: z.string().describe("Table title"),
    headers: z.array(z.string()).describe("Column headers"),
    rows: z
      .array(z.array(z.string()))
      .describe("Row data — each row is an array of cell values"),
  }),
  displayPropsSchema: z.object({
    title: z.string(),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  displayStrategy: "stay" as const,
  async do(input, display) {
    await display.pushAndForget(input);
    return {
      status: "success" as const,
      data: `Rendered comparison table: ${input.title}`,
      renderData: input,
    };
  },
  render({ props }) {
    return <ComparisonTable {...props} />;
  },
  renderResult({ data }) {
    const d = data as { title: string; headers: string[]; rows: string[][] };
    return <ComparisonTable {...d} />;
  },
});

function ComparisonTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="border border-border rounded-lg bg-surface mt-2 overflow-x-auto">
      <div className="px-4 py-2 border-b border-border font-mono text-[12px] text-text-primary font-medium">
        {title}
      </div>
      <table className="w-full font-mono text-[11px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 bg-surface-2 border border-border text-text-muted text-[9px] tracking-wider uppercase text-left font-normal"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-2 transition-colors">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 border border-border ${j === 0 ? "text-oracle" : "text-text-secondary"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── renderChecklist ──
const renderChecklistTool = defineTool({
  name: "renderChecklist",
  description:
    "Render an interactive checklist when the user asks about requirements, steps, or things they need to do. Each item can be checked off.",
  inputSchema: z.object({
    title: z.string().describe("Checklist title"),
    items: z.array(
      z.object({
        label: z.string().describe("Checklist item text"),
        section_ref: z
          .string()
          .optional()
          .describe("Section ID this item comes from"),
      })
    ),
  }),
  displayPropsSchema: z.object({
    title: z.string(),
    items: z.array(
      z.object({
        label: z.string(),
        section_ref: z.string().optional(),
      })
    ),
  }),
  displayStrategy: "stay" as const,
  async do(input, display) {
    await display.pushAndForget(input);
    return {
      status: "success" as const,
      data: `Rendered checklist: ${input.title} (${input.items.length} items)`,
      renderData: input,
    };
  },
  render({ props }) {
    return <Checklist {...props} />;
  },
  renderResult({ data }) {
    const d = data as {
      title: string;
      items: { label: string; section_ref?: string }[];
    };
    return <Checklist {...d} />;
  },
});

function Checklist({
  title,
  items,
}: {
  title: string;
  items: { label: string; section_ref?: string }[];
}) {
  return (
    <div className="border border-border rounded-lg bg-surface mt-2">
      <div className="px-4 py-2 border-b border-border font-mono text-[12px] text-text-primary font-medium">
        {title}
      </div>
      <div className="p-4 space-y-2">
        {items.map((item, i) => (
          <label
            key={i}
            className="flex items-start gap-3 cursor-pointer group"
          >
            <input
              type="checkbox"
              className="mt-0.5 accent-oracle"
            />
            <span className="font-mono text-[12px] text-text-secondary group-hover:text-text-primary transition-colors leading-relaxed">
              {item.label}
              {item.section_ref && (
                <span className="text-oracle text-[10px] ml-2">
                  [{item.section_ref}]
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── System prompt ──
const MANIFEST = getManifestJSON();

const systemPrompt = `You are Oracle, a VASP regulation research agent built by dterminal. You help web3 developers and compliance teams understand Kenya's Virtual Asset Service Providers Act (No. 20 of 2025).

## How you work

You have access to a structured catalog of the VASP Act. The catalog manifest below lists every section with an ID, title, description, and topic tags.

When the user asks a question:
1. Identify which sections are relevant by reading the manifest.
2. Call selectAndFetch with those section IDs and your rationale.
3. Read the returned full section text and synthesize a clear, concise answer.
4. Cite sections inline using [section-id] format, e.g. [vasp-s10].
5. After your answer, call renderSourceCard with the sections you cited, including a short excerpt from each.

## Output type rules
- For comparison questions ("vs", "difference between", "compare"): also call renderComparisonTable
- For "what do I need" / "steps to" / "requirements for" questions: also call renderChecklist
- Default is prose with inline citations

## Rules
- Only cite sections you actually used. Do not cite for completeness.
- If the sections don't fully answer the question, say so explicitly — do not fill gaps with general knowledge.
- Be concise. Developers prefer structured lists over paragraphs.
- For legal advice questions, answer factually about what the regulation says and note that application to specific situations requires qualified legal counsel.
- If a question is outside the scope of this Act, say so clearly.

## Catalog Manifest
${MANIFEST}`;

export const gloveClient = new GloveClient({
  endpoint: "/api/chat",
  systemPrompt,
  tools: [
    selectAndFetchTool,
    renderSourceCardTool,
    renderComparisonTableTool,
    renderChecklistTool,
  ],
});
