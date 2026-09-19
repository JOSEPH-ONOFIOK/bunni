"use client";

import { useCallback, useEffect, useRef } from "react";
import { FiArrowUpRight, FiCheck, FiLoader, FiLock } from "react-icons/fi";
import {
  PINNED_POST_ID,
  QUESTS,
  isQuestDone,
  parsePostLink,
  questLinkFor,
  type QuestId,
  type QuestState,
} from "@/lib/quests";

/**
 * The four steps, as a checklist.
 *
 * The quote step is the gate: it is the only one X lets us actually check, so
 * it is verified against the live post and every step after it stays locked
 * until it passes. The attestation steps before it are ticked by the guest —
 * there is no way to read a follow or a like on the free tier — but they can't
 * be used to skip the part that is enforced.
 */

/** Index of the step that must verify before the rest unlock. */
const GATE_INDEX = QUESTS.findIndex((q) => q.needsLink);

export type QuoteCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "bad"; reason: string };

export function Quests({
  state,
  onChange,
  username,
  check,
  onCheckChange,
}: {
  state: QuestState;
  onChange: (next: QuestState) => void;
  username?: string;
  check: QuoteCheck;
  onCheckChange: (next: QuoteCheck) => void;
}) {
  const gateCleared = check.state === "ok";

  return (
    <ol className="space-y-2.5">
      {QUESTS.map((quest, i) => {
        const done = isQuestDone(quest.id, state, username);
        const link = questLinkFor(quest.id, PINNED_POST_ID || undefined);
        // Everything past the gate waits for the verified quote.
        const locked = i > GATE_INDEX && !gateCleared;

        return (
          <li
            key={quest.id}
            className={`rounded-2xl border-2 p-4 transition-colors ${
              locked
                ? "border-ink/10 bg-ink/3"
                : done
                  ? "border-grass/70 bg-grass/10"
                  : "border-ink/12 bg-white/70"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink font-mono text-[10px] font-bold ${
                  done && !locked
                    ? "bg-grass text-ink"
                    : locked
                      ? "bg-white text-ink/25"
                      : "bg-white text-ink/50"
                }`}
              >
                {locked ? (
                  <FiLock className="h-3 w-3" />
                ) : done ? (
                  <FiCheck className="h-3.5 w-3.5" />
                ) : (
                  quest.n
                )}
              </span>

              <div className={`min-w-0 flex-1 ${locked ? "opacity-45" : ""}`}>
                <p className="text-sm font-extrabold">{quest.title}</p>
                <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-ink/60">
                  {quest.detail}
                </p>

                {quest.phrase && (
                  // The phrase is multi-line and people copy it by eye, so it
                  // has to render with its breaks rather than as one run-on.
                  <p className="mt-2 rounded-xl border-2 border-dashed border-ink/15 bg-paper px-3 py-2 text-xs leading-relaxed font-semibold whitespace-pre-line">
                    {quest.phrase}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={locked ? -1 : undefined}
                    className={`inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-3 py-1.5 text-[11px] font-extrabold transition-transform duration-150 ${
                      locked ? "pointer-events-none" : "hover:-translate-y-0.5"
                    }`}
                  >
                    {quest.cta}
                    <FiArrowUpRight className="h-3 w-3" />
                  </a>

                  {!quest.needsLink && (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onChange({ ...state, [quest.id]: !done })}
                      aria-pressed={done}
                      className={`rounded-full border-2 border-ink px-3 py-1.5 text-[11px] font-extrabold transition-transform duration-150 enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed ${
                        done ? "bg-grass text-ink" : "bg-gold text-ink"
                      }`}
                    >
                      {done ? "Done" : "Mark done"}
                    </button>
                  )}
                </div>

                {quest.needsLink && (
                  <QuoteField
                    questId={quest.id}
                    value={String(state[quest.id] ?? "")}
                    onChange={(v) => onChange({ ...state, [quest.id]: v })}
                    username={username}
                    check={check}
                    onCheckChange={onCheckChange}
                  />
                )}

                {locked && (
                  <p className="mt-2.5 text-[11px] font-semibold text-ink/50">
                    Clear step {QUESTS[GATE_INDEX].n} to unlock this.
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The quote link input. Shape is checked as you type; the real check runs
 * against X — debounced, and on blur — because that is what actually decides
 * whether the gate opens.
 */
function QuoteField({
  questId,
  value,
  onChange,
  username,
  check,
  onCheckChange,
}: {
  questId: QuestId;
  value: string;
  onChange: (v: string) => void;
  username?: string;
  check: QuoteCheck;
  onCheckChange: (next: QuoteCheck) => void;
}) {
  const trimmed = value.trim();
  const parsed = parsePostLink(trimmed);
  // The post this link points at, or "" when the link isn't usable yet. A
  // plain string keeps the check effect's dependencies statically checkable.
  const postAuthor = parsed?.username ?? "";
  const wrongAccount =
    postAuthor !== "" &&
    Boolean(username) &&
    postAuthor.toLowerCase() !== username!.toLowerCase();
  const malformed = trimmed.length > 0 && parsed === null;
  const checkable = postAuthor !== "" && !wrongAccount;

  // Only the newest check may settle the state, so a slow early request can't
  // overwrite the verdict for a link the guest has since corrected.
  const runId = useRef(0);

  const verify = useCallback(
    async (link: string) => {
      const id = ++runId.current;
      onCheckChange({ state: "checking" });

      try {
        const res = await fetch("/api/quests/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link }),
        });
        const data = await res.json();
        if (id !== runId.current) return;

        onCheckChange(
          data.ok
            ? { state: "ok" }
            : {
                state: "bad",
                reason: String(data.reason ?? "That post didn't check out."),
              },
        );
      } catch {
        if (id !== runId.current) return;
        onCheckChange({
          state: "bad",
          reason: "Couldn't reach the checker. Try again in a sec.",
        });
      }
    },
    [onCheckChange],
  );

  // Re-check shortly after typing stops, so a pasted link verifies itself.
  useEffect(() => {
    if (!checkable) {
      // Abandon any check in flight: its verdict is about an older link.
      runId.current++;
      onCheckChange({ state: "idle" });
      return;
    }

    const t = setTimeout(() => verify(trimmed), 600);
    return () => clearTimeout(t);
  }, [trimmed, checkable, verify, onCheckChange]);

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <input
          id={questId}
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://x.com/you/status/…"
          aria-label="Link to your quote post"
          aria-invalid={malformed || wrongAccount || check.state === "bad"}
          className={`w-full rounded-xl border-2 bg-white px-3 py-2 text-xs outline-none placeholder:text-ink/30 focus:border-ink ${
            check.state === "ok" ? "border-grass" : "border-ink/15"
          }`}
        />

        {check.state === "checking" && (
          <FiLoader className="h-4 w-4 shrink-0 animate-spin text-ink/40" />
        )}
        {check.state === "ok" && (
          <FiCheck className="h-4 w-4 shrink-0 text-grass" />
        )}
      </div>

      {malformed && (
        <p className="mt-1.5 text-[11px] font-semibold text-lava">
          That doesn&rsquo;t look like a post link.
        </p>
      )}
      {wrongAccount && (
        <p className="mt-1.5 text-[11px] font-semibold text-lava">
          That post is on @{postAuthor}, not @{username}.
        </p>
      )}
      {!malformed && !wrongAccount && check.state === "bad" && (
        <p className="mt-1.5 text-[11px] font-semibold text-lava">
          {check.reason}
        </p>
      )}
      {check.state === "ok" && (
        <p className="mt-1.5 text-[11px] font-semibold text-teal-deep">
          Verified — quote found.
        </p>
      )}
    </div>
  );
}
