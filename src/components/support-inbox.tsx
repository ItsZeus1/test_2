"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, Inbox, Send } from "lucide-react";
import { toast } from "sonner";

import { formatStamp, statusLabel, statusTone } from "@/components/support-pill";
import { useI18n } from "@/lib/i18n";
import { listSupportTickets, markSupportRead, onStoreChange, replyToSupportTicket, setSupportTicketStatus } from "@/lib/store/api";
import type { SupportTicket } from "@/lib/store/types";

/** Admin inbox: every user's conversation, newest activity first, with instant replies. */
export function SupportInbox() {
  const { t, language } = useI18n();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancel = false;
    const load = () => {
      void listSupportTickets().then((result) => {
        if (!cancel && result.ok) setTickets(result.tickets);
      });
    };
    load();
    const stop = onStoreChange(load);
    return () => {
      cancel = true;
      stop();
    };
  }, []);

  const selected = useMemo(() => tickets.find((ticket) => ticket.id === selectedId) ?? null, [tickets, selectedId]);
  const waiting = tickets.filter((ticket) => ticket.unreadByAdmin || ticket.status === "OPEN").length;

  useEffect(() => {
    if (selected?.unreadByAdmin) void markSupportRead({ ticketId: selected.id });
  }, [selected?.id, selected?.unreadByAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [selected?.id, selected?.messages.length]);

  async function reply() {
    const text = draft.trim();
    if (!selected || !text || busy) return;
    setBusy(true);
    try {
      const result = await replyToSupportTicket({ ticketId: selected.id, text });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  async function toggleClosed() {
    if (!selected) return;
    const result = await setSupportTicketStatus({ ticketId: selected.id, status: selected.status === "CLOSED" ? "OPEN" : "CLOSED" });
    if (!result.ok) toast.error(result.error);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void reply();
    }
  }

  return (
    <section id="support-inbox" className="nova-grid-border glass mt-6 scroll-mt-24 overflow-hidden rounded-[1.75rem]">
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
        <Inbox className="size-5 text-violet" />
        <h2 className="font-display text-xl font-extrabold">{t.supportInbox}</h2>
        {waiting > 0 ? (
          <span className="keep-white grid min-w-6 place-items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold text-white">{waiting}</span>
        ) : null}
      </header>

      <div className="grid md:h-[32rem] md:grid-cols-[18rem_1fr]">
        {/* Conversation list */}
        <ul className={`max-h-[26rem] overflow-y-auto border-white/10 md:max-h-none md:border-e ${selected ? "hidden md:block" : ""}`}>
          {tickets.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">{t.noTickets}</li> : null}
          {tickets.map((ticket) => {
            const last = ticket.messages[ticket.messages.length - 1];
            return (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(ticket.id)}
                  className={`flex w-full min-w-0 flex-col gap-1 border-b border-white/5 px-4 py-3 text-start hover:bg-white/5 ${selected?.id === ticket.id ? "bg-indigo-500/10" : ""}`}
                >
                  <span className="flex w-full min-w-0 items-center gap-2">
                    {ticket.unreadByAdmin ? <span className="size-2 shrink-0 rounded-full bg-rose-500" aria-hidden /> : null}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{ticket.userName}</span>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusTone(ticket.status)}`}>{statusLabel(t, ticket.status)}</span>
                  </span>
                  <span className="truncate text-xs font-semibold text-violet">{ticket.subject}</span>
                  <span className="truncate text-xs text-muted">{last?.text ?? ""}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Thread + reply */}
        <div className={`flex min-h-[24rem] min-w-0 flex-col ${selected ? "" : "hidden md:flex"}`}>
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label={t.back}
                  className="grid size-9 place-items-center rounded-xl border border-white/10 md:hidden"
                >
                  <ArrowLeft className="size-4 rtl:rotate-180" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">
                    {selected.userName} · <span className="font-normal text-muted">{selected.subject}</span>
                  </p>
                  <p className="truncate text-xs text-muted" dir="ltr">
                    {selected.userEmail}
                  </p>
                </div>
                <button type="button" onClick={() => void toggleClosed()} className="min-h-9 rounded-full border border-white/15 px-3 text-xs font-bold">
                  {selected.status === "CLOSED" ? t.reopenTicket : t.closeTicket}
                </button>
              </div>
              <div ref={threadRef} className="support-thread flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {selected.messages.map((message) => {
                  const mine = message.sender === "ADMIN";
                  return (
                    <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${mine ? "bubble-mine rounded-ee-md" : "bubble-theirs rounded-es-md"}`}>
                        {!mine ? <p className="mb-0.5 text-[11px] font-bold text-violet">{selected.userName}</p> : null}
                        <p className="break-words whitespace-pre-wrap">{message.text}</p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/75" : "text-muted"}`} dir="ltr">
                          {formatStamp(message.createdAt, language)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-end gap-2 border-t border-white/10 p-3">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  maxLength={1000}
                  placeholder={t.replyPh}
                  aria-label={t.replyPh}
                  className="field max-h-32 min-h-11 flex-1 resize-none"
                />
                <button
                  type="button"
                  onClick={() => void reply()}
                  disabled={busy || !draft.trim()}
                  aria-label={t.send}
                  className="btn-glow keep-white grid size-11 shrink-0 place-items-center rounded-2xl text-white disabled:opacity-50"
                >
                  <Send className="size-4 rtl:-scale-x-100" />
                </button>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted">{tickets.length ? t.pickConversation : t.noTickets}</div>
          )}
        </div>
      </div>
    </section>
  );
}
