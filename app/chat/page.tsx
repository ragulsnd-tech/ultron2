"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JarvisOrb from "@/components/JarvisOrb";

type Message = {
  role: "user" | "assistant";
  text: string;
};

type VoiceRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

const WELCOME: Message = {
  role: "assistant",
  text: "Vanakkam! Naan JARVIS. Enna help venum?",
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("JARVIS ready");
  const [historyReady, setHistoryReady] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const voiceModeRef = useRef(false);
  const voiceOnRef = useRef(true);
  const loadingRef = useRef(false);
  const mountedRef = useRef(false);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    mountedRef.current = true;

    try {
      const saved = localStorage.getItem("jarvis-chat-history");

      if (saved) {
        const parsed: unknown = JSON.parse(saved);

        if (
          Array.isArray(parsed) &&
          parsed.every(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.text === "string"
          )
        ) {
          setMessages(parsed as Message[]);
        }
      }
    } catch {}

    setHistoryReady(true);

    return () => {
      mountedRef.current = false;
      voiceModeRef.current = false;

      try {
        recognitionRef.current?.stop();
      } catch {}

      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!historyReady) return;

    try {
      localStorage.setItem(
        "jarvis-chat-history",
        JSON.stringify(messages)
      );
    } catch {}
  }, [messages, historyReady]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, loading]);

  const speak = useCallback((text: string) => {
    if (!voiceOnRef.current || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ta-IN";
    utterance.rate = 0.95;
    utterance.pitch = 0.9;

    const voices = window.speechSynthesis.getVoices();

    utterance.voice =
      voices.find((v) => v.lang.toLowerCase().startsWith("ta")) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("en-in")) ||
      null;

    window.speechSynthesis.speak(utterance);
  }, []);

  async function openCommand(question: string): Promise<boolean> {
    const text = question.trim();

    const searchMatch = text.match(
      /^(?:google(?:\s+la)?|search(?:\s+google)?|search\s+for)\s+(.+)$/i
    );

    if (searchMatch) {
      const query = searchMatch[1].trim();

      window.open(
        "https://www.google.com/search?q=" + encodeURIComponent(query),
        "_blank",
        "noopener,noreferrer"
      );

      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: `Google-la "${query}" search open panninen.`,
        },
      ]);

      setStatus("Google search opened");
      return true;
    }

    const websiteMatch = text.match(
      /^(?:open|visit|go to)\s+(google|youtube|gmail|wikipedia|facebook|instagram|whatsapp web)$/i
    );

    if (websiteMatch) {
      const sites: Record<string, string> = {
        google: "https://www.google.com",
        youtube: "https://www.youtube.com",
        gmail: "https://mail.google.com",
        wikipedia: "https://www.wikipedia.org",
        facebook: "https://www.facebook.com",
        instagram: "https://www.instagram.com",
        "whatsapp web": "https://web.whatsapp.com",
      };

      const site = websiteMatch[1].toLowerCase();

      window.open(sites[site], "_blank", "noopener,noreferrer");

      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: `${site} website open panna try panninen.`,
        },
      ]);

      setStatus("Website command completed");
      return true;
    }

    const appMatch = text.match(
      /^(?:jarvis[, ]*)?(?:open|launch|start)\s+(calculator|notepad|paint|chrome|edge|explorer|file explorer|settings|whatsapp|youtube|instagram|telegram)$/i
    );

    if (appMatch) {
      const app = appMatch[1].toLowerCase();

      try {
        const response = await fetch(
          "http://127.0.0.1:3210/open-app",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ app }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "App open failed");
        }

        setMessages((old) => [
          ...old,
          {
            role: "assistant",
            text: data.message || `${app} open command sent.`,
          },
        ]);
      } catch {
        setMessages((old) => [
          ...old,
          {
            role: "assistant",
            text:
              `${app} app-ai direct-ah open panna local agent setup thevai. ` +
              "Browser mattum use pannina installed apps-ai launch panna mudiyadhu.",
          },
        ]);
      }

      setStatus("App command checked");
      return true;
    }

    return false;
  }

  async function sendMessage(text = input) {
    const question = text.trim();

    if (!question || loadingRef.current) return;

    setMessages((old) => [
      ...old,
      { role: "user", text: question },
    ]);

    setInput("");
    loadingRef.current = true;
    setLoading(true);
    setStatus("JARVIS thinking...");

    try {
      const handled = await openCommand(question);

      if (handled) return;

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: question }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed");
      }

      const reply = String(data.reply || "Reply kidaikkala.");

      setMessages((old) => [
        ...old,
        { role: "assistant", text: reply },
      ]);

      speak(reply);
      setStatus("JARVIS ready");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong.";

      setMessages((old) => [
        ...old,
        {
          role: "assistant",
          text: "Error: " + errorMessage,
        },
      ]);

      setStatus("Check API key or server");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  const startListening = useCallback(() => {
    if (!mountedRef.current) return;

    const browser = window as Window & {
      SpeechRecognition?: new () => VoiceRecognition;
      webkitSpeechRecognition?: new () => VoiceRecognition;
    };

    const SpeechAPI =
      browser.SpeechRecognition || browser.webkitSpeechRecognition;

    if (!SpeechAPI) {
      setStatus("Voice unsupported. Try Chrome.");
      voiceModeRef.current = false;
      setVoiceMode(false);
      return;
    }

    try {
      recognitionRef.current?.stop();
    } catch {}

    const recognition = new SpeechAPI();

    recognition.lang = "ta-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      if (!mountedRef.current) return;

      setListening(true);
      setStatus("Listening...");
    };

    recognition.onresult = (event: any) => {
      const heard = String(
        event.results?.[0]?.[0]?.transcript || ""
      ).trim();

      if (!heard) return;

      const command = heard.toLowerCase().replace(/[.!?,]/g, "").trim();

      if (
        /^(stop listening|stop voice mode|exit voice mode)$/.test(command)
      ) {
        voiceModeRef.current = false;
        setVoiceMode(false);
        setStatus("Voice mode stopped");
        return;
      }

      if (/^(voice off|mute voice)$/.test(command)) {
        voiceOnRef.current = false;
        setVoiceOn(false);
        window.speechSynthesis?.cancel();
        setStatus("Voice output OFF");
        return;
      }

      if (/^(voice on|unmute voice)$/.test(command)) {
        voiceOnRef.current = true;
        setVoiceOn(true);
        setStatus("Voice output ON");
        return;
      }

      void sendMessage(heard);
    };

    recognition.onerror = (event: any) => {
      if (!mountedRef.current) return;

      setListening(false);

      if (event.error !== "no-speech" && event.error !== "aborted") {
        setStatus("Mic error: " + event.error);
      }
    };

    recognition.onend = () => {
      if (!mountedRef.current) return;

      setListening(false);

      if (voiceModeRef.current) {
        window.setTimeout(() => {
          if (mountedRef.current && voiceModeRef.current) {
            recognitionRef.current = null;
            startListeningRef.current();
          }
        }, 900);
      } else {
        setStatus("JARVIS ready");
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setStatus("Tap Start Voice again");
    }
  }, [speak]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  function toggleVoiceMode() {
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceMode(false);

      try {
        recognitionRef.current?.stop();
      } catch {}

      setListening(false);
      setStatus("Voice mode stopped");
    } else {
      voiceModeRef.current = true;
      setVoiceMode(true);
      setStatus("Starting voice...");
      startListeningRef.current();
    }
  }

  function toggleVoiceOutput() {
    const next = !voiceOnRef.current;

    voiceOnRef.current = next;
    setVoiceOn(next);

    if (!next && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    setStatus(next ? "Voice output ON" : "Voice output OFF");
  }

  function newChat() {
    if (loadingRef.current) return;

    setMessages([WELCOME]);
    setInput("");
    setStatus("New chat started");
  }

  return (
    <main style={s.page}>
      <div style={s.orbSection}>
        <JarvisOrb compact />
      </div>

      <header style={s.header}>
        <a href="/" style={s.home}>← Home</a>

        <div style={s.brand}>
          <div style={s.orb}>J</div>
          <div>
            <h1 style={s.title}>JARVIS</h1>
            <div style={s.subtitle}>AI CHAT + VOICE</div>
          </div>
        </div>

        <button
          type="button"
          style={s.smallButton}
          onClick={toggleVoiceOutput}
        >
          {voiceOn ? "🔊 ON" : "🔇 OFF"}
        </button>
      </header>

      <div style={s.toolbar}>
        <div style={s.status}>
          <span
            style={{
              ...s.dot,
              background: listening ? "#34d399" : "#22d3ee",
            }}
          />
          {status}
        </div>

        <button
          type="button"
          style={s.newChat}
          onClick={newChat}
        >
          + New Chat
        </button>
      </div>

      <section
        style={s.messages}
        aria-live="polite"
        aria-label="Chat messages"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              ...s.message,
              alignSelf:
                message.role === "user" ? "flex-end" : "flex-start",
              borderColor:
                message.role === "user" ? "#0e7490" : "#334155",
              background:
                message.role === "user" ? "#123747" : "#151f30",
            }}
          >
            <div style={s.sender}>
              {message.role === "user" ? "YOU" : "JARVIS"}
            </div>

            <div style={s.messageText}>{message.text}</div>

            {message.role === "assistant" && (
              <button
                type="button"
                style={s.speakButton}
                onClick={() => speak(message.text)}
              >
                🔊 Speak
              </button>
            )}
          </div>
        ))}

        {loading && (
          <div style={s.thinking}>JARVIS is thinking...</div>
        )}

        <div ref={bottomRef} />
      </section>

      <div style={s.controls}>
        <button
          type="button"
          style={s.voiceButton}
          onClick={toggleVoiceMode}
        >
          {voiceMode ? "⏹ Stop Voice" : "🎙 Start Voice"}
        </button>

        <form
          style={s.form}
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <input
            style={s.input}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Message JARVIS..."
            aria-label="Message JARVIS"
          />

          <button
            type="submit"
            style={{
              ...s.send,
              opacity: loading || !input.trim() ? 0.5 : 1,
            }}
            disabled={loading || !input.trim()}
          >
            ➤
          </button>
        </form>

        <div style={s.note}>
          Mic permission allow pannu. Voice support browser-ai depend pannum.
        </div>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: {
    height: "100dvh",
    minHeight: "480px",
    width: "100%",
    overflow: "hidden",
    background:
      "radial-gradient(ellipse at top, #10283b 0%, #070c15 55%, #03060b 100%)",
    color: "#e5f4ff",
    display: "flex",
    flexDirection: "column",
    fontFamily: "Arial, sans-serif",
    boxSizing: "border-box",
    padding: "12px",
    gap: "10px",
  },
  orbSection: {
    position: "relative",
    width: "100%",
    height: "150px",
    flexShrink: 0,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    paddingBottom: "12px",
    borderBottom: "1px solid #26394d",
    flexShrink: 0,
  },
  home: {
    color: "#67e8f9",
    textDecoration: "none",
    fontSize: "13px",
    flexShrink: 0,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    minWidth: 0,
  },
  orb: {
    width: "38px",
    height: "38px",
    flexShrink: 0,
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    color: "#a5f3fc",
    border: "2px solid #22d3ee",
    boxShadow: "0 0 18px #0891b2",
  },
  title: { margin: 0, fontSize: "16px", letterSpacing: "2px" },
  subtitle: {
    marginTop: "4px",
    fontSize: "10px",
    color: "#67e8f9",
    letterSpacing: "1px",
  },
  smallButton: {
    background: "#102b3a",
    color: "#67e8f9",
    border: "1px solid #256579",
    borderRadius: "8px",
    padding: "9px 8px",
    fontSize: "12px",
    flexShrink: 0,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
  },
  status: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    color: "#a5c4d7",
    fontSize: "12px",
    padding: "2px 4px",
    minWidth: 0,
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
  },
  newChat: {
    background: "#102b3a",
    color: "#67e8f9",
    border: "1px solid #256579",
    borderRadius: "8px",
    padding: "8px 10px",
    flexShrink: 0,
  },
  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "8px 2px 16px",
  },
  message: {
    maxWidth: "88%",
    padding: "12px",
    border: "1px solid",
    borderRadius: "14px",
    overflowWrap: "anywhere",
    lineHeight: 1.5,
  },
  sender: {
    color: "#67e8f9",
    fontSize: "10px",
    letterSpacing: "1.5px",
    fontWeight: 700,
    marginBottom: "6px",
  },
  messageText: { whiteSpace: "pre-wrap", fontSize: "15px" },
  speakButton: {
    marginTop: "8px",
    background: "transparent",
    color: "#67e8f9",
    border: "1px solid #34566a",
    borderRadius: "7px",
    padding: "5px 9px",
  },
  thinking: { color: "#67e8f9", fontSize: "13px", padding: "8px" },
  controls: {
    flexShrink: 0,
    borderTop: "1px solid #26394d",
    paddingTop: "10px",
    background: "#080d18",
  },
  voiceButton: {
    width: "100%",
    background: "#123344",
    color: "#a5f3fc",
    border: "1px solid #256579",
    borderRadius: "10px",
    padding: "12px",
    fontSize: "14px",
    fontWeight: 700,
  },
  form: { display: "flex", gap: "8px", marginTop: "8px" },
  input: {
    flex: 1,
    minWidth: 0,
    background: "#111c2b",
    color: "#ffffff",
    border: "1px solid #334b61",
    borderRadius: "10px",
    padding: "13px",
    fontSize: "15px",
    outline: "none",
  },
  send: {
    width: "48px",
    background: "#0891b2",
    color: "white",
    border: 0,
    borderRadius: "10px",
    fontSize: "20px",
  },
  note: {
    color: "#71869b",
    fontSize: "10px",
    textAlign: "center",
    padding: "8px 0 2px",
  },
};
