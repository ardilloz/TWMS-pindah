import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Send, Sparkles, Trash2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { apiDelete, apiGet } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Msg = { id?: string; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Berapa total stok semua gudang saat ini?",
  "Gudang mana yang stok Glangse-nya paling banyak?",
  "Ringkas 5 transaksi terakhir",
  "Siapa saja supplier yang terdaftar?",
];

function parseSseChunk(buffer: string): { events: Record<string, unknown>[]; rest: string } {
  const events: Record<string, unknown>[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
    } catch {
      /* partial JSON — skip */
    }
  }
  return { events, rest };
}

function renderContent(text: string) {
  // Minimal markdown: **bold** only; newlines handled by whitespace-pre-wrap.
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

export default function Asisten() {
  const me = useMe();
  const history = useQuery({ queryKey: ["assistant-history"], queryFn: () => apiGet<Msg[]>("/assistant/history"), retry: false });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current && history.data) {
      setMessages(history.data.map((m) => ({ role: m.role, content: m.content })));
      loaded.current = true;
    }
  }, [history.data]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((ms) => [...ms, { role: "user", content: message }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `Gagal (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const { events, rest } = parseSseChunk(buffer + decoder.decode(value, { stream: true }));
        buffer = rest;
        for (const ev of events) {
          if (typeof ev.token === "string") {
            setMessages((ms) => {
              const copy = [...ms];
              copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + ev.token };
              return copy;
            });
          } else if (typeof ev.error === "string") {
            setMessages((ms) => {
              const copy = [...ms];
              copy[copy.length - 1] = { role: "assistant", content: String(ev.error) };
              return copy;
            });
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan";
      setMessages((ms) => {
        const copy = [...ms];
        copy[copy.length - 1] = { role: "assistant", content: msg };
        return copy;
      });
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function clearHistory() {
    try {
      await apiDelete("/assistant/history");
      setMessages([]);
      toast.success("Riwayat percakapan dihapus");
    } catch {
      toast.error("Gagal menghapus riwayat");
    }
  }

  return (
    <div data-testid="assistant-page" className="flex h-[calc(100vh-7rem)] flex-col lg:h-[calc(100vh-9rem)]">
      <PageHeader
        eyebrow="Asisten AI"
        title="Tanya Jawab Data Gudang"
        actions={
          messages.length > 0 ? (
            <Button variant="outline" onClick={() => void clearHistory()} disabled={busy} data-testid="assistant-clear-button">
              <Trash2 className="size-4" /> Hapus Riwayat
            </Button>
          ) : undefined
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border bg-white shadow-sm">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-8" data-testid="assistant-message-list">
          {messages.length === 0 && (
            <div className="mx-auto mt-10 max-w-md text-center" data-testid="assistant-empty-state">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-800/10">
                <Sparkles className="size-7 text-amber-800" />
              </div>
              <h2 className="mt-4 font-heading text-xl font-semibold text-amber-950">Halo{me.data ? `, ${me.data.name}` : ""}!</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tanyakan apa saja tentang stok, transaksi, supplier, pembelian, dan penjualan. Jawaban diambil dari data terkini aplikasi Anda.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    data-testid={`assistant-suggestion-${SUGGESTIONS.indexOf(s)}`}
                    className="rounded-full border border-amber-800/20 bg-amber-50 px-3.5 py-1.5 text-xs font-medium text-amber-900 transition-colors duration-150 hover:bg-amber-100"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")} data-testid={`assistant-message-${m.role}-${i}`}>
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  m.role === "user" ? "bg-amber-800 text-white" : "bg-amber-800/10 text-amber-900",
                )}
              >
                {m.role === "user" ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
              </div>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed md:max-w-[75%]",
                  m.role === "user" ? "bg-amber-800 text-white" : "border bg-amber-50/60 text-foreground",
                )}
              >
                {m.content || (busy && i === messages.length - 1) ? (
                  m.content ? renderContent(m.content) : <span className="inline-block animate-pulse text-muted-foreground">Menjawab…</span>
                ) : (
                  m.content
                )}
              </div>
            </div>
          ))}
        </div>

        <form
          className="flex items-center gap-2 border-t bg-amber-50/40 p-3 md:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tulis pertanyaan Anda…"
            disabled={busy}
            data-testid="assistant-input"
            className="h-11 flex-1 rounded-xl border bg-white px-4 text-sm outline-none transition-colors duration-150 placeholder:text-muted-foreground focus:border-amber-700 disabled:opacity-60"
          />
          <Button type="submit" disabled={busy || !input.trim()} data-testid="assistant-send-button" className="h-11 rounded-xl px-5">
            <Send className="size-4" /> Kirim
          </Button>
        </form>
      </div>
    </div>
  );
}
