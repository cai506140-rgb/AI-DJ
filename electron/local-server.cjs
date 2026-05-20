const express = require("express");
const fs = require("node:fs");
const path = require("node:path");

let server;

async function startLocalServer({ port, staticDir, tracksPath }) {
  if (server) return server;

  const app = express();
  const tracks = JSON.parse(fs.readFileSync(tracksPath, "utf-8"));
  const state = {
    currentTrackId: tracks[0].id,
    mood: "curious",
    lastBrainSource: "local",
    queue: seedQueue(tracks, tracks[0].id),
    messages: [
      {
        id: id(),
        role: "dj",
        text: "晚上好，我是 Localhost FM 的 AI DJ。这里先用一组虚拟唱片热身，等你的天气、心情和一句话。",
        createdAt: new Date().toISOString()
      }
    ]
  };

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(staticDir));

  app.get("/api/state", (_req, res) => {
    res.json(buildState(tracks, state));
  });

  app.get("/api/weather", (_req, res) => {
    res.json(getMockWeather());
  });

  app.get("/api/audio/:trackId", (req, res) => {
    sendGeneratedWav(req.params.trackId, res);
  });

  app.post("/api/chat", (req, res) => {
    const text = String(req.body?.message || "").trim();
    if (!text) {
      res.status(400).json({ error: "Missing message" });
      return;
    }

    state.messages.push({
      id: id(),
      role: "user",
      text,
      createdAt: new Date().toISOString()
    });

    const brain = runLocalBrain(text, tracks, state);
    state.mood = brain.mood;
    state.lastBrainSource = "local";
    state.queue = promoteTrack(brain.nextTrackId, state.queue, state.currentTrackId);

    const message = {
      id: id(),
      role: "dj",
      text: brain.reply,
      createdAt: new Date().toISOString()
    };
    state.messages.push(message);

    res.json({
      message,
      brain,
      state: buildState(tracks, state)
    });
  });

  app.post("/api/playlist/next", (_req, res) => {
    state.currentTrackId = state.queue[0] || tracks[0].id;
    state.queue = seedQueue(tracks, state.currentTrackId);
    res.json(buildState(tracks, state));
  });

  app.post("/api/playlist/select", (req, res) => {
    const trackId = String(req.body?.trackId || "");
    if (!tracks.some((track) => track.id === trackId)) {
      res.status(404).json({ error: "Unknown track" });
      return;
    }
    state.currentTrackId = trackId;
    state.queue = seedQueue(tracks, state.currentTrackId);
    res.json(buildState(tracks, state));
  });

  app.post("/api/tts", (req, res) => {
    const text = String(req.body?.text || "").trim();
    res.json({
      mode: "text",
      text,
      message: "Desktop packaged mode uses text voice unless Fish Audio is wired separately."
    });
  });

  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });

  server = await listenOnAvailablePort(app, port);

  return server;
}

async function listenOnAvailablePort(app, preferredPort) {
  for (let offset = 0; offset < 20; offset += 1) {
    const port = preferredPort + offset;
    const listener = await new Promise((resolve) => {
      const pending = app
        .listen(port, "127.0.0.1", () => resolve(pending))
        .on("error", () => resolve(null));
    });
    if (listener) {
      return {
        listener,
        port,
        url: `http://127.0.0.1:${port}/`
      };
    }
  }
  return null;
}

function buildState(tracks, state) {
  const currentTrack = findTrack(tracks, state.currentTrackId);
  return {
    dj: {
      name: "Localhost FM",
      tagline: "把天气、日程和心情压成一盘正在转的磁带",
      bio: "我是一位在本地服务器里醒着的 AI DJ。现在还没有接真实音乐服务，但已经会听你的描述，用天气、时间和虚拟曲库排一段私人电台。",
      tasteTags: ["lo-fi", "ambient", "city pop", "jazz hop", "dream pop", "house", "night drive", "late night folk"],
      brainMode: "desktop",
      brainSource: state.lastBrainSource
    },
    context: {
      weather: getMockWeather(),
      mood: state.mood,
      timeSlot: getTimeSlot(),
      localTime: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    },
    currentTrack,
    queue: state.queue.map((trackId) => findTrack(tracks, trackId)),
    tracks,
    messages: state.messages
  };
}

function getMockWeather() {
  return {
    source: "mock",
    city: "Desktop",
    main: "Clouds",
    description: "多云，有一点适合整理心情的风",
    temperatureC: 23,
    feelsLikeC: 22,
    humidity: 68,
    updatedAt: new Date().toISOString()
  };
}

function runLocalBrain(text, tracks, state) {
  const lower = text.toLowerCase();
  const mood = /(温柔|柔|soft|安静|轻|累|雨|慢)/i.test(lower)
    ? "tender"
    : /(专注|工作|学习|focus|study)/i.test(lower)
      ? "focused"
      : /(开心|跳舞|能量|dance|嗨|快)/i.test(lower)
        ? "energetic"
        : state.mood;
  const tags = /(雨|rain|温柔|安静|慢)/i.test(lower) ? ["ambient", "lo-fi"] : ["downtempo", "texture"];
  const nextTrack =
    tracks
      .filter((track) => track.id !== state.currentTrackId)
      .map((track) => ({
        track,
        score:
          (track.moods.includes(mood) ? 6 : 0) +
          tags.reduce((score, tag) => score + (track.tags.includes(tag) ? 5 : 0), 0) +
          (track.timeSlots.includes(getTimeSlot()) ? 3 : 0)
      }))
      .sort((a, b) => b.score - a.score)[0]?.track || tracks[0];

  return {
    source: "local",
    reply: `收到。我把当前桌面电台的时间和你的描述合在一起，下一首先推 ${nextTrack.title}。它的 ${nextTrack.tags.slice(0, 2).join(" / ")} 会比较贴近这一刻。`,
    nextTrackId: nextTrack.id,
    mood,
    tags
  };
}

function seedQueue(tracks, excludeTrackId) {
  const slot = getTimeSlot();
  return tracks
    .filter((track) => track.id !== excludeTrackId)
    .sort((a, b) => Number(b.timeSlots.includes(slot)) - Number(a.timeSlots.includes(slot)))
    .slice(0, 4)
    .map((track) => track.id);
}

function promoteTrack(trackId, currentQueue, currentTrackId) {
  return [trackId, ...currentQueue.filter((id) => id !== trackId && id !== currentTrackId)].slice(0, 4);
}

function findTrack(tracks, trackId) {
  return tracks.find((track) => track.id === trackId) || tracks[0];
}

function getTimeSlot() {
  const hour = new Date().getHours();
  if (hour < 5) return "late";
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function id() {
  return Math.random().toString(36).slice(2, 10);
}

const toneMap = {
  "rain-window": 196,
  "metro-neon": 246.94,
  "green-tea-break": 220,
  "salt-air-call": 174.61,
  "tiny-warehouse": 261.63,
  "paper-moon": 164.81,
  sunlint: 293.66,
  "blue-hour-cache": 207.65
};

function sendGeneratedWav(trackId, res) {
  const sampleRate = 22050;
  const seconds = 24;
  const totalSamples = sampleRate * seconds;
  const frequency = toneMap[trackId] || 220;
  const dataSize = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, i / 2205, (totalSamples - i) / 2205);
    const sample = Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * frequency * t) * 0.24 * envelope));
    buffer.writeInt16LE(sample * 32767, 44 + i * 2);
  }

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(buffer);
}

module.exports = { startLocalServer };
