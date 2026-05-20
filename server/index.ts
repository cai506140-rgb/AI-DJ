import express from "express";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sendGeneratedWav } from "./audio";
import { runBrain, type ChatMessage, type Track } from "./providers/brain";
import { getWeather, type WeatherState } from "./providers/weather";
import { synthesizeSpeech } from "./providers/tts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT ?? 8787);

app.use(express.json({ limit: "1mb" }));

const tracks = JSON.parse(
  await readFile(join(__dirname, "data", "tracks.json"), "utf-8")
) as Track[];

let currentTrackId = tracks[0].id;
let mood = "curious";
let queue = seedQueue(currentTrackId);
let lastBrainSource: "codex" | "local" = "local";
const messages: ChatMessage[] = [
  {
    id: cryptoId(),
    role: "dj",
    text: "晚上好，我是 Localhost FM 的 AI DJ。这里先用一组虚拟唱片热身，等你的天气、心情和一句话。",
    createdAt: new Date().toISOString()
  }
];

app.get("/api/state", async (_req, res) => {
  const weather = await getWeather();
  res.json(await buildState(weather));
});

app.get("/api/weather", async (_req, res) => {
  res.json(await getWeather());
});

app.get("/api/audio/:trackId", (req, res) => {
  sendGeneratedWav(req.params.trackId, res);
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message ?? "").trim();
  if (!message) {
    res.status(400).json({ error: "Missing message" });
    return;
  }

  const userMessage: ChatMessage = {
    id: cryptoId(),
    role: "user",
    text: message,
    createdAt: new Date().toISOString()
  };
  messages.push(userMessage);

  const weather = await getWeather();
  const currentTrack = findTrack(currentTrackId);
  const brain = await runBrain({
    message,
    context: {
      mood,
      timeSlot: getTimeSlot(),
      weather,
      currentTrack
    },
    tracks,
    history: messages
  });

  mood = brain.mood;
  lastBrainSource = brain.source;
  queue = promoteTrack(brain.nextTrackId, queue);
  const djMessage: ChatMessage = {
    id: cryptoId(),
    role: "dj",
    text: brain.reply,
    createdAt: new Date().toISOString()
  };
  messages.push(djMessage);

  res.json({
    message: djMessage,
    brain,
    state: await buildState(weather)
  });
});

app.post("/api/playlist/next", async (_req, res) => {
  const next = queue[0] ?? tracks[0].id;
  currentTrackId = next;
  queue = seedQueue(currentTrackId);
  res.json(await buildState(await getWeather()));
});

app.post("/api/playlist/select", async (req, res) => {
  const trackId = String(req.body?.trackId ?? "");
  if (!tracks.some((track) => track.id === trackId)) {
    res.status(404).json({ error: "Unknown track" });
    return;
  }
  currentTrackId = trackId;
  queue = seedQueue(currentTrackId);
  res.json(await buildState(await getWeather()));
});

app.post("/api/tts", synthesizeSpeech);

app.listen(port, () => {
  console.log(`AI DJ server listening on http://127.0.0.1:${port}`);
});

async function buildState(weather: WeatherState) {
  const currentTrack = findTrack(currentTrackId);
  return {
    dj: {
      name: "Localhost FM",
      tagline: "把天气、日程和心情压成一盘正在转的磁带",
      bio: "我是一位在本地服务器里醒着的 AI DJ。现在还没有接真实音乐服务，但已经会听你的描述，用天气、时间和虚拟曲库排一段私人电台。",
      tasteTags: [
        "lo-fi",
        "ambient",
        "city pop",
        "jazz hop",
        "dream pop",
        "house",
        "night drive",
        "late night folk"
      ],
      brainMode: process.env.AI_DJ_BRAIN ?? "codex",
      brainSource: lastBrainSource
    },
    context: {
      weather,
      mood,
      timeSlot: getTimeSlot(),
      localTime: new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit"
      })
    },
    currentTrack,
    queue: queue.map(findTrack),
    tracks,
    messages
  };
}

function seedQueue(excludeTrackId: string) {
  const slot = getTimeSlot();
  return tracks
    .filter((track) => track.id !== excludeTrackId)
    .sort((a, b) => Number(b.timeSlots.includes(slot)) - Number(a.timeSlots.includes(slot)))
    .slice(0, 4)
    .map((track) => track.id);
}

function promoteTrack(trackId: string, currentQueue: string[]) {
  return [trackId, ...currentQueue.filter((id) => id !== trackId && id !== currentTrackId)].slice(0, 4);
}

function findTrack(trackId: string) {
  return tracks.find((track) => track.id === trackId) ?? tracks[0];
}

function getTimeSlot() {
  const hour = new Date().getHours();
  if (hour < 5) return "late";
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function cryptoId() {
  return Math.random().toString(36).slice(2, 10);
}
