"use client";

import { useGlove } from "glove-react";
import { useGloveVoice } from "glove-react/voice";
import { Providers } from "./providers";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useSectionViewer } from "@/lib/section-viewer";
import { stt, createTTS } from "@/lib/voice";

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * Maps tool names to human-readable step descriptions.
 * These appear in the multi-step progress indicator so users
 * understand what Oracle is doing at each phase.
 */
const TOOL_STEPS: Record<string, { label: string; description: string; icon: string }> = {
  selectAndFetch: {
    label: "Searching",
    description: "Scanning the Act for relevant sections",
    icon: "search",
  },
  renderSourceCard: {
    label: "Citing",
    description: "Preparing source citations",
    icon: "cite",
  },
  renderComparisonTable: {
    label: "Comparing",
    description: "Building comparison table",
    icon: "table",
  },
  renderChecklist: {
    label: "Checking",
    description: "Building compliance checklist",
    icon: "check",
  },
};

// ─── Main Chat UI ─────────────────────────────────────────────────────────

function ChatUI() {
  const {
    timeline,
    streamingText,
    busy,
    isCompacting,
    slots,
    sendMessage,
    renderSlot,
    renderToolResult,
    runnable,
  } = useGlove();

  const voice = useGloveVoice({
    runnable,
    voice: { stt, createTTS, turnMode: "manual" },
  });

  const [input, setInput] = useState("");
  const [holding, setHolding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const holdingRef = useRef(false);

  // Hold-to-talk: start recording
  const holdStart = useCallback(async () => {
    if (holdingRef.current) return;
    holdingRef.current = true;
    setHolding(true);

    // If Oracle is speaking, interrupt first
    if (voice.mode === "speaking") {
      voice.interrupt();
      return;
    }

    if (!voice.isActive) {
      await voice.start();
      // Pipeline starts unmuted — mic is live
    } else {
      voice.unmute();
    }
  }, [voice]);

  // Hold-to-talk: release → commit + mute
  const holdEnd = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHolding(false);

    if (voice.isActive && voice.mode === "listening") {
      voice.commitTurn();
      // Mute after a small delay so STT flush completes
      setTimeout(() => voice.mute(), 100);
    }
  }, [voice]);

  // Desktop: spacebar hold-to-talk (only when textarea not focused)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      // Don't hijack spacebar when typing in the textarea
      if (document.activeElement === textareaRef.current) return;
      e.preventDefault();
      holdStart();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (document.activeElement === textareaRef.current) return;
      e.preventDefault();
      holdEnd();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [holdStart, holdEnd]);

  // Index slots by toolCallId for O(1) lookup during timeline rendering
  const slotsByToolCallId = useMemo(() => {
    const map = new Map<string, (typeof slots)[number]>();
    for (const slot of slots) {
      map.set(slot.toolCallId, slot);
    }
    return map;
  }, [slots]);

  // Track which slots are accounted for in the timeline
  const renderedSlotIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of timeline) {
      if (entry.kind === "tool") {
        if (slotsByToolCallId.has(entry.id)) {
          ids.add(entry.id);
        }
      }
    }
    return ids;
  }, [timeline, slotsByToolCallId]);

  // Any orphan slots not tied to a timeline entry yet
  const orphanSlots = useMemo(
    () => slots.filter((s) => !renderedSlotIds.has(s.toolCallId)),
    [slots, renderedSlotIds]
  );

  // Derive current processing phase for the step indicator.
  // We look at the most recent tool entry to figure out where we are.
  const currentPhase = useMemo(() => {
    if (!busy) return null;

    const toolEntries = timeline.filter((e) => e.kind === "tool");
    const lastTool = toolEntries[toolEntries.length - 1];

    if (streamingText) return "synthesizing";
    if (lastTool?.status === "running") return lastTool.name;
    if (lastTool && (lastTool.status === "success" || lastTool.status === "error") && !streamingText) {
      return "synthesizing";
    }
    return "thinking";
  }, [busy, timeline, streamingText]);

  // Auto-scroll on new content
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [timeline.length, streamingText, slots.length]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage(text);
    setInput("");
    // Reset textarea height after send
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea as content changes
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const hasMessages = timeline.length > 0;

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* ── Header ── */}
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* Oracle logo mark — small glowing dot */}
            <div className="w-2 h-2 rounded-full bg-oracle oracle-pulse-dot" />
            <span className="font-mono text-[15px] font-bold text-oracle tracking-wider uppercase">
              Oracle
            </span>
          </div>
          <span className="font-mono text-[9px] text-dterminal tracking-widest uppercase opacity-80">
            by dterminal
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* {busy && (
            <div className="flex items-center gap-2 animate-fade-in">
              <div className="oracle-spinner" />
              <span className="font-mono text-[9px] text-oracle tracking-wider uppercase">
                Processing
              </span>
            </div>
          )} */}
          <div className="font-mono text-[9px] text-text-muted tracking-widest uppercase">
            VASP Act &middot; Kenya &middot; No. 20 of 2025
          </div>
        </div>
      </header>

      {/* ── Chat area ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto chat-scroll">
        {!hasMessages && !streamingText ? (
          <WelcomeScreen onSuggest={(q) => sendMessage(q)} />
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-1">
            {timeline.map((entry, i) => {
              if (entry.kind === "user") {
                return (
                  <div key={i} className="mb-8 message-enter">
                    <div className="font-mono text-[9px] text-text-muted tracking-widest uppercase mb-2 flex items-center gap-2">
                      <span className="w-4 h-px bg-text-muted" />
                      You
                    </div>
                    <p className="text-[15px] text-text-primary leading-relaxed font-medium">
                      {entry.text}
                    </p>
                  </div>
                );
              }

              if (entry.kind === "agent_text") {
                return (
                  <div key={i} className="mb-8 message-enter">
                    <div className="border-l-2 border-oracle/60 pl-5">
                      <div className="font-mono text-[9px] text-oracle tracking-widest uppercase mb-3 flex items-center gap-2">
                        <OracleIcon size={12} />
                        Oracle
                      </div>
                      <OracleMarkdown text={entry.text} />
                    </div>
                  </div>
                );
              }

              if (entry.kind === "tool") {
                const activeSlot = slotsByToolCallId.get(entry.id);
                const isCompleted = entry.status === "success" || entry.status === "error" || entry.status === "aborted";

                return (
                  <div key={i} className="message-enter">
                    {/* ── Active tool: show the step indicator ── */}
                    {entry.status === "running" && !activeSlot && (
                      <ToolLoadingIndicator toolName={entry.name} />
                    )}

                    {/* ── Completed tool with no slot: show subtle completion badge ── */}
                    {isCompleted && !activeSlot && !entry.renderData && (
                      <ToolCompletedBadge toolName={entry.name} />
                    )}

                    {/* Active slot — render inline */}
                    {activeSlot && (
                      <div className="mb-6 animate-fade-in">{renderSlot(activeSlot)}</div>
                    )}

                    {/* Completed tool with renderData — use renderToolResult for history */}
                    {isCompleted && !activeSlot && entry.renderData !== undefined && (
                      <div className="mb-6 animate-fade-in">{renderToolResult(entry)}</div>
                    )}
                  </div>
                );
              }

              return null;
            })}

            {/* Orphan slots (not yet tied to a timeline entry) */}
            {orphanSlots.map((slot) => (
              <div key={slot.id} className="mb-6 animate-fade-in">
                {renderSlot(slot)}
              </div>
            ))}

            {/* ── Compaction indicator ── */}
            {isCompacting && (
              <CompactingIndicator />
            )}

            {/* ── Streaming text (hidden during compaction) ── */}
            {streamingText && !isCompacting && (
              <div className="mb-8 message-enter">
                <div className="border-l-2 border-oracle/60 pl-5">
                  <div className="font-mono text-[9px] text-oracle tracking-widest uppercase mb-3 flex items-center gap-2">
                    <OracleIcon size={12} />
                    Oracle
                  </div>
                  <OracleMarkdown text={streamingText} />
                  <span className="inline-block w-[2px] h-[16px] bg-oracle typing-cursor ml-0.5 align-text-bottom rounded-full" />
                </div>
              </div>
            )}

            {/* ── "Thinking" state: after user message, before any tool/text ── */}
            {busy && !streamingText && currentPhase === "thinking" && (
              <ThinkingIndicator />
            )}

            {/* ── Synthesizing state: after tool completes, before text streams ── */}
            {busy && !streamingText && currentPhase === "synthesizing" && (
              <SynthesizingIndicator />
            )}
          </div>
        )}
      </div>

      {/* ── Voice transcript overlay (shown when holding) ── */}
      {(holding || voice.mode === "speaking" || voice.mode === "thinking") && (
        <div className="border-t border-oracle/30 bg-surface/90 backdrop-blur-sm px-4 sm:px-6 py-3 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 font-mono text-[13px] min-h-[24px]">
              {holding && (
                <>
                  <VoicePulse />
                  <span className={voice.transcript ? "text-text-primary" : "text-text-muted"}>
                    {voice.transcript || "Listening..."}
                  </span>
                </>
              )}
              {!holding && voice.mode === "thinking" && (
                <>
                  <div className="oracle-spinner" />
                  <span className="text-text-muted">Processing your request...</span>
                </>
              )}
              {!holding && voice.mode === "speaking" && (
                <>
                  <VoiceSpeaking />
                  <span className="text-oracle">Oracle is speaking</span>
                  <button
                    type="button"
                    onClick={voice.interrupt}
                    className="ml-auto font-mono text-[10px] text-text-muted hover:text-oracle tracking-wider uppercase transition-colors"
                  >
                    Interrupt
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="border-t border-border bg-surface/80 backdrop-blur-sm px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={busy ? "Oracle is working..." : "Ask about the VASP Act..."}
              disabled={busy}
              rows={1}
              className="w-full bg-bg border border-border rounded-lg px-4 py-2.5 font-mono text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-oracle-dim input-glow transition-all disabled:opacity-50 resize-none overflow-hidden leading-normal"
              aria-label="Message input"
            />
            {busy && (
              <div className="absolute right-3 bottom-3">
                <div className="oracle-spinner" />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !input.trim()}
            className="shrink-0 self-end size-[42px] flex items-center justify-center bg-oracle border border-oracle rounded-lg text-white hover:bg-oracle-dim disabled:opacity-20 disabled:cursor-not-allowed transition-all hover:shadow-lg hover:shadow-oracle/20 active:scale-[0.98]"
            aria-label="Send message"
          >
            {busy ? (
              <div className="oracle-spinner w-3! h-3! border-white/30! border-t-white!" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L7 9M14 2L9.5 14L7 9M14 2L2 6.5L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          {/* Hold-to-talk mic button (mobile: press and hold) */}
          <button
            type="button"
            onPointerDown={(e) => { e.preventDefault(); holdStart(); }}
            onPointerUp={holdEnd}
            onPointerLeave={holdEnd}
            onContextMenu={(e) => e.preventDefault()}
            className={`shrink-0 self-end size-[42px] flex items-center justify-center border rounded-lg transition-all active:scale-[0.98] select-none touch-none ${
              holding
                ? "border-oracle bg-oracle/20 text-oracle shadow-lg shadow-oracle/20"
                : voice.mode === "speaking"
                  ? "border-oracle/50 bg-oracle-glow text-oracle animate-pulse"
                  : "border-border text-text-muted hover:text-oracle hover:border-oracle/50 hover:bg-oracle-glow"
            }`}
            aria-label="Hold to talk"
          >
            <MicIcon />
          </button>
        </div>
        <div className="max-w-3xl mx-auto mt-1 text-center sm:text-right">
          <span className="font-mono text-[9px] text-text-muted tracking-wider hidden sm:inline">
            Enter to send · Hold Space to talk
          </span>
          {voice.error && (
            <span className="font-mono text-[9px] text-red-400 tracking-wider ml-3">
              {voice.error.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Loading Components ───────────────────────────────────────────────────

/**
 * Shown when a tool is actively running. Displays the tool name,
 * a descriptive subtitle, and a shimmer skeleton to indicate
 * that data is being fetched/processed.
 */
function ToolLoadingIndicator({ toolName }: { toolName: string }) {
  const step = TOOL_STEPS[toolName];
  const label = step?.label ?? toolName;
  const description = step?.description ?? `Running ${toolName}`;

  return (
    <div className="mb-6 animate-fade-in">
      <div className="border border-border rounded-lg bg-surface/50 p-4 overflow-hidden">
        {/* Status row */}
        <div className="flex items-center gap-3 mb-3">
          <div className="oracle-spinner" />
          <div>
            <div className="font-mono text-[11px] text-oracle tracking-wider uppercase font-medium">
              {label}
            </div>
            <div className="font-mono text-[10px] text-text-muted tracking-wide mt-0.5">
              {description}
            </div>
          </div>
        </div>

        {/* Skeleton lines to suggest incoming content */}
        <div className="space-y-2 mt-3">
          <div className="h-2.5 rounded skeleton-shimmer w-[85%]" />
          <div className="h-2.5 rounded skeleton-shimmer w-[70%]" />
          <div className="h-2.5 rounded skeleton-shimmer w-[55%]" />
        </div>

        {/* Subtle progress bar at the bottom */}
        <div className="mt-4 h-[2px] bg-border rounded-full overflow-hidden">
          <div className="h-full bg-oracle/50 rounded-full progress-bar-fill" />
        </div>
      </div>
    </div>
  );
}

/**
 * Small inline badge shown after a tool completes successfully.
 * Keeps a minimal footprint so it doesn't distract from the answer.
 */
function ToolCompletedBadge({ toolName }: { toolName: string }) {
  const step = TOOL_STEPS[toolName];
  const label = step?.label ?? toolName;

  return (
    <div className="mb-4 animate-fade-in">
      <div className="inline-flex items-center gap-2 font-mono text-[10px] text-text-muted tracking-wider uppercase">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-green">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3.5 6L5.5 8L8.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label} complete
      </div>
    </div>
  );
}

/**
 * Shown immediately after the user sends a message, before any
 * tool call begins. A brief "thinking" state so the user knows
 * Oracle received the message and is deciding what to do.
 */
function CompactingIndicator() {
  return (
    <div className="mb-6 animate-fade-in">
      <div className="border-l-2 border-oracle/30 pl-5">
        <div className="flex items-center gap-3">
          <div className="oracle-spinner" />
          <div>
            <span className="font-mono text-[10px] text-oracle tracking-wider uppercase">
              Reorganizing context
            </span>
            <span className="font-mono text-[10px] text-text-muted tracking-wider ml-2">
              Compacting conversation history
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="mb-6 animate-fade-in">
      <div className="border-l-2 border-oracle/30 pl-5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-oracle animate-bounce [animation-delay:0ms]" />
            <div className="w-1.5 h-1.5 rounded-full bg-oracle animate-bounce [animation-delay:150ms]" />
            <div className="w-1.5 h-1.5 rounded-full bg-oracle animate-bounce [animation-delay:300ms]" />
          </div>
          <span className="font-mono text-[10px] text-text-muted tracking-wider uppercase">
            Oracle is thinking
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown after tool calls complete and before the agent starts
 * streaming its text response. Tells the user Oracle is now
 * putting together the answer from the fetched data.
 */
function SynthesizingIndicator() {
  return (
    <div className="mb-6 animate-fade-in">
      <div className="border-l-2 border-oracle/30 pl-5">
        <div className="flex items-center gap-3">
          <div className="oracle-spinner" />
          <div>
            <span className="font-mono text-[10px] text-oracle tracking-wider uppercase">
              Synthesizing answer
            </span>
            <span className="font-mono text-[10px] text-text-muted tracking-wider ml-2">
              Analyzing fetched sections
            </span>
          </div>
        </div>
        {/* Mini skeleton to hint that text is about to appear */}
        <div className="mt-3 space-y-2">
          <div className="h-2 rounded skeleton-shimmer w-[90%]" />
          <div className="h-2 rounded skeleton-shimmer w-[75%]" />
        </div>
      </div>
    </div>
  );
}

// ─── Voice Components ─────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5.5" y="1.5" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7.5C3 10.26 5.24 12.5 8 12.5C10.76 12.5 13 10.26 13 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="12.5" x2="8" y2="14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


function VoicePulse() {
  return (
    <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
      <div className="absolute w-4 h-4 rounded-full bg-oracle/30 animate-ping" />
      <div className="w-2 h-2 rounded-full bg-oracle" />
    </div>
  );
}

function VoiceSpeaking() {
  return (
    <div className="flex items-center gap-0.5 h-4 shrink-0">
      <div className="w-0.5 bg-oracle rounded-full animate-bounce h-2 [animation-delay:0ms]" />
      <div className="w-0.5 bg-oracle rounded-full animate-bounce h-3 [animation-delay:150ms]" />
      <div className="w-0.5 bg-oracle rounded-full animate-bounce h-4 [animation-delay:300ms]" />
      <div className="w-0.5 bg-oracle rounded-full animate-bounce h-3 [animation-delay:150ms]" />
      <div className="w-0.5 bg-oracle rounded-full animate-bounce h-2 [animation-delay:0ms]" />
    </div>
  );
}

// ─── Small Decorative Components ──────────────────────────────────────────

/** Tiny Oracle brand icon used next to agent messages */
function OracleIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" className="shrink-0">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" className="text-oracle" />
      <circle cx="7" cy="7" r="2" fill="currentColor" className="text-oracle" />
    </svg>
  );
}

// ─── Markdown Renderer ────────────────────────────────────────────────────

function OracleMarkdown({ text }: { text: string }) {
  return (
    <div className="oracle-prose text-[13px] text-text-secondary leading-relaxed">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{processCitations(children)}</p>,
          strong: ({ children }) => (
            <strong className="text-text-primary font-medium">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="text-text-primary italic">{children}</em>
          ),
          h1: ({ children }) => (
            <h3 className="font-mono text-[14px] font-semibold text-text-primary mt-5 mb-2">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className="font-mono text-[13px] font-semibold text-text-primary mt-5 mb-2">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="font-mono text-[12px] font-semibold text-text-primary mt-4 mb-2">
              {children}
            </h4>
          ),
          ul: ({ children }) => (
            <ul className="list-none space-y-2 mb-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-2 mb-4 marker:text-oracle marker:font-mono marker:text-[11px]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed flex items-start gap-2">
              <span className="text-oracle font-mono text-[10px] mt-[5px] shrink-0 opacity-60">&#9656;</span>
              <span>{processCitations(children)}</span>
            </li>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <pre className="bg-bg border border-border rounded-lg p-4 font-mono text-[12px] text-text-code overflow-x-auto mb-4">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="font-mono text-[12px] text-text-code bg-surface-2 px-1.5 py-0.5 border border-border rounded">
                {children}
              </code>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-oracle-dim pl-4 text-text-muted italic mb-4">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-oracle underline underline-offset-2 hover:text-oracle-dim transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          hr: () => <hr className="border-border my-5" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ─── Citation helpers ─────────────────────────────────────────────────────

function processCitations(children: React.ReactNode): React.ReactNode {
  if (typeof children === "string") {
    return renderCitationsInText(children);
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return <span key={i}>{renderCitationsInText(child)}</span>;
      }
      return child;
    });
  }
  return children;
}

function renderCitationsInText(text: string): React.ReactNode {
  const parts = text.split(/(\[vasp-[^\]]+\])/g);
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(vasp-[^\]]+)\]$/);
        if (match) {
          return <CitationPill key={i} id={match[1]} />;
        }
        return part;
      })}
    </>
  );
}

function CitationPill({ id }: { id: string }) {
  return (
    <span
      className="inline-flex items-center font-mono text-[9px] text-oracle border border-oracle/30 bg-oracle-glow px-1.5 py-0.5 mx-0.5 rounded align-baseline cursor-default hover:bg-oracle-glow-strong hover:border-oracle/50 transition-all"
      title={id}
    >
      {id}
    </span>
  );
}

// ─── Welcome Screen ───────────────────────────────────────────────────────

function WelcomeScreen({ onSuggest }: { onSuggest: (q: string) => void }) {
  const suggestions = [
    "What is a virtual asset under this Act?",
    "What are the licensing requirements for VASPs?",
    "What penalties apply for operating without a licence?",
    "What are the AML/CFT obligations?",
    "Compare CMA and CBK roles under this Act",
    "What steps do I need to register as a VASP?",
  ];

  return (
    <div className="max-w-2xl mx-auto px-6 py-20 animate-fade-in">
      {/* Hero */}
      <div className="mb-10">
        <div className="font-mono text-[11px] text-dterminal tracking-widest uppercase mb-5 flex items-center gap-2">
          <span className="w-5 h-px bg-dterminal inline-block" />
          Oracle &middot; by dterminal
        </div>
        <h1 className="font-mono text-[48px] font-bold text-oracle leading-none mb-3 tracking-tight">
          Oracle
        </h1>
        <p className="font-mono text-[11px] text-text-muted tracking-wider uppercase mb-8">
          VASP Act Research Agent &middot; Catalog-Driven &middot; No RAG
        </p>
        <p className="text-[15px] text-text-secondary leading-relaxed max-w-lg">
          Ask questions about Kenya&apos;s{" "}
          <strong className="text-text-primary font-medium">
            Virtual Asset Service Providers Act (No. 20 of 2025)
          </strong>
          . Oracle reads the full Act, selects relevant sections, and synthesizes
          answers with exact citations.
        </p>
      </div>

      {/* Suggestions */}
      <div className="border-t border-border pt-8">
        <div className="font-mono text-[9px] text-text-muted tracking-widest uppercase mb-4">
          Try asking
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {suggestions.map((q) => (
            <button
              key={q}
              onClick={() => onSuggest(q)}
              className="suggestion-card text-left border border-border bg-surface/60 rounded-lg px-4 py-3.5 font-mono text-[12px] text-text-secondary hover:text-text-primary hover:border-oracle/40 hover:bg-oracle-glow transition-all group"
              aria-label={`Ask: ${q}`}
            >
              <span className="text-oracle/50 group-hover:text-oracle mr-2 transition-colors">&rarr;</span>
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Section Viewer (sidebar on desktop, modal on mobile) ────────────────

function SectionViewer() {
  const { activeSection, close } = useSectionViewer();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    if (activeSection) {
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [activeSection, close]);

  if (!activeSection) return null;

  return (
    <>
      {/* ── Mobile: full-screen modal overlay ── */}
      <div className="lg:hidden fixed inset-0 z-50">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={close}
        />
        {/* Modal */}
        <div className="absolute inset-x-0 bottom-0 top-12 bg-bg border-t border-border rounded-t-2xl overflow-hidden animate-slide-up flex flex-col">
          <SectionViewerHeader onClose={close} section={activeSection} />
          <SectionViewerContent content={activeSection.content} />
        </div>
      </div>

      {/* ── Desktop: right sidebar ── */}
      <div
        ref={panelRef}
        className="hidden lg:flex fixed right-0 top-0 bottom-0 w-[420px] xl:w-[480px] z-40 border-l border-border bg-bg animate-slide-in-right flex-col"
      >
        <SectionViewerHeader onClose={close} section={activeSection} />
        <SectionViewerContent content={activeSection.content} />
      </div>
    </>
  );
}

function SectionViewerHeader({
  onClose,
  section,
}: {
  onClose: () => void;
  section: { id: string; title: string };
}) {
  return (
    <div className="border-b border-border bg-surface/80 backdrop-blur-sm px-5 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-[10px] text-oracle tracking-wider uppercase shrink-0">
          {section.id}
        </span>
        <span className="font-mono text-[12px] text-text-primary font-medium truncate">
          {section.title}
        </span>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 ml-3 w-7 h-7 rounded-lg border border-border bg-surface hover:bg-surface-2 hover:border-oracle/30 flex items-center justify-center transition-all"
        aria-label="Close section viewer"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-text-muted">
          <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function SectionViewerContent({ content }: { content: string }) {
  return (
    <div className="flex-1 overflow-y-auto chat-scroll p-5">
      <div className="font-mono text-[12px] text-text-secondary leading-[1.8] whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <Providers>
      <ChatUI />
      <SectionViewer />
    </Providers>
  );
}
