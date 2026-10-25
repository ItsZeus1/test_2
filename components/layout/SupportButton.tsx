"use client";

import { useState } from "react";
import { Headset, MessageCircle, Send, X } from "lucide-react";
import { TELEGRAM_URL, WHATSAPP_URL } from "@/lib/constants";

export function SupportButton() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="glass flex flex-col gap-1 rounded-xl p-2 text-sm">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10"
          >
            <MessageCircle className="h-4 w-4 text-mint" /> WhatsApp
          </a>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10"
          >
            <Send className="h-4 w-4 text-sky-400" /> Telegram
          </a>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support menu" : "Open 24/7 support"}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet to-mint text-ink shadow-neon transition-transform hover:scale-105"
      >
        {open ? <X className="h-5 w-5" /> : <Headset className="h-5 w-5" />}
      </button>
    </div>
  );
}
