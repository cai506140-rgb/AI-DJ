import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CloudSun,
  Disc3,
  Loader2,
  MessageCircle,
  Mic2,
  Pause,
  Play,
  Radio,
  Send,
  SkipForward,
  Sparkles,
  Volume2
} from "lucide-react";
import { fetchState, nextTrack, selectTrack, sendChat, speak } from "./api";
import type { ChatMessage, DjState, Track } from "./types";

function App() {
  const [state, setState] = useState<DjState | null>(null);
  const [input, setInput] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [voiceMode, setVoiceMode] = useState<"idle" | "audio" | "text">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchState()
      .then(setState)
      .catch(() => setError("本地服务器还没回应，确认 npm run dev 已经启动。"));
  }, []);

  useEffect(() => {
    if (!state || !audioRef.current) return;
    audioRef.current.load();
    setProgress(0);
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    }
  }, [state?.currentTrack.id]);

  const activeTags = useMemo(() => {
    if (!state) return [];
    return Array.from(new Set([...state.currentTrack.tags, state.context.mood])).slice(0, 6);
  }, [state]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    await audio.play();
    setIsPlaying(true);
  }

  async function skip() {
    const next = await nextTrack();
    setState(next);
    setIsPlaying(true);
  }

  async function choose(track: Track) {
    const updated = await selectTrack(track.id);
    setState(updated);
    setIsPlaying(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isThinking) return;
    setInput("");
    setIsThinking(true);
    setError("");
    try {
      const response = await sendChat(message);
      setState(response.state);
      const mode = await speak(response.message.text).catch(() => "text" as const);
      setVoiceMode(mode);
    } catch {
      setError("这次聊天没接上，Codex 可能还在启动。稍后再试一次。");
    } finally {
      setIsThinking(false);
    }
  }

  if (!state) {
    return (
      <main className="boot">
        <Loader2 className="spin" size={28} />
        <span>正在调频到 Localhost FM</span>
        {error && <p>{error}</p>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="intro-panel">
        <div className="station-mark">
          <Radio size={24} />
          <span>24H LOCALCAST</span>
        </div>
        <h1>{state.dj.name}</h1>
        <p className="tagline">{state.dj.tagline}</p>
        <p className="bio">{state.dj.bio}</p>

        <div className="taste-grid" aria-label="taste tags">
          {state.dj.tasteTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>

        <div className="context-strip">
          <ContextPill icon={<CloudSun size={16} />} label={state.context.weather.description} />
          <ContextPill icon={<Sparkles size={16} />} label={`${state.context.mood} / ${state.context.timeSlot}`} />
          <ContextPill icon={<Mic2 size={16} />} label={voiceMode === "audio" ? "voice on" : "text voice"} />
        </div>
      </section>

      <section className="player-panel">
        <audio
          ref={audioRef}
          src={state.currentTrack.audioUrl}
          onTimeUpdate={(event) => {
            const audio = event.currentTarget;
            setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
          }}
          onEnded={skip}
        />

        <div className="record-area">
          <div className="record" style={{ "--accent": state.currentTrack.color } as React.CSSProperties}>
            <div className="record-label">
              <Disc3 size={38} />
            </div>
          </div>
          <div className="now-playing">
            <span className="eyebrow">NOW PLAYING</span>
            <h2>{state.currentTrack.title}</h2>
            <p>{state.currentTrack.artist}</p>
            <div className="active-tags">
              {activeTags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="progress-track">
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="controls">
          <button className="icon-button" onClick={togglePlayback} aria-label={isPlaying ? "pause" : "play"}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>
          <button className="icon-button" onClick={skip} aria-label="next track">
            <SkipForward size={23} />
          </button>
          <div className="meter">
            <Volume2 size={17} />
            <span>{state.context.localTime}</span>
          </div>
        </div>

        <Queue tracks={state.queue} onChoose={choose} />
      </section>

      <section className="chat-panel">
        <div className="chat-header">
          <div>
            <span className="eyebrow">LIVE CHAT</span>
            <h2>和 DJ 说一句</h2>
          </div>
          <span className="brain-badge">
            {state.dj.brainMode} / {state.dj.brainSource}
          </span>
        </div>

        <div className="messages">
          {state.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isThinking && (
            <div className="message dj">
              <Loader2 className="spin" size={16} />
              <span>正在听天气和你的语气...</span>
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        <form onSubmit={submit} className="chat-form">
          <MessageCircle size={18} />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：今天下雨，想听温柔一点的"
          />
          <button type="submit" aria-label="send message" disabled={isThinking || !input.trim()}>
            {isThinking ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
      </section>
    </main>
  );
}

function ContextPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="context-pill">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Queue({ tracks, onChoose }: { tracks: Track[]; onChoose: (track: Track) => void }) {
  return (
    <div className="queue">
      <span className="eyebrow">UP NEXT</span>
      {tracks.map((track, index) => (
        <button key={track.id} className="queue-row" onClick={() => onChoose(track)}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{track.title}</strong>
          <em>{track.tags[0]}</em>
        </button>
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={`message ${message.role}`}>
      <span>{message.text}</span>
    </div>
  );
}

export default App;
