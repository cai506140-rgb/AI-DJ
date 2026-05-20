import { spawn } from "node:child_process";
import type { WeatherState } from "./weather";

export type Track = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  bpm: number;
  tags: string[];
  moods: string[];
  weather: string[];
  timeSlots: string[];
  color: string;
  audioUrl: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "dj";
  text: string;
  createdAt: string;
};

export type DjContext = {
  mood: string;
  timeSlot: string;
  weather: WeatherState;
  currentTrack: Track;
};

export type BrainInput = {
  message: string;
  context: DjContext;
  tracks: Track[];
  history: ChatMessage[];
};

export type BrainOutput = {
  source: "codex" | "local";
  reply: string;
  nextTrackId: string;
  mood: string;
  tags: string[];
};

type CodexJson = {
  reply?: string;
  nextTrackId?: string;
  mood?: string;
  tags?: string[];
};

export async function runBrain(input: BrainInput): Promise<BrainOutput> {
  const mode = process.env.AI_DJ_BRAIN ?? "codex";
  if (mode !== "local") {
    try {
      const codex = await runCodexBrain(input);
      if (codex.reply && codex.nextTrackId && input.tracks.some((track) => track.id === codex.nextTrackId)) {
        return {
          source: "codex",
          reply: codex.reply,
          nextTrackId: codex.nextTrackId,
          mood: codex.mood || input.context.mood,
          tags: Array.isArray(codex.tags) ? codex.tags.slice(0, 5) : []
        };
      }
    } catch {
      // The local brain below keeps the DJ usable when Codex CLI is missing, busy, or offline.
    }
  }

  return runLocalBrain(input);
}

function runLocalBrain(input: BrainInput): BrainOutput {
  const text = input.message.toLowerCase();
  const mood = inferMood(text, input.context.mood);
  const desiredTags = inferTags(text, input.context.weather.main);
  const ranked = input.tracks
    .filter((track) => track.id !== input.context.currentTrack.id)
    .map((track) => ({ track, score: scoreTrack(track, mood, desiredTags, input.context) }))
    .sort((a, b) => b.score - a.score);
  const nextTrack = ranked[0]?.track ?? input.tracks[0];

  return {
    source: "local",
    reply: `收到。我把现在的 ${input.context.weather.description}、${input.context.timeSlot} 时段和你刚刚说的心情合在一起，下一首先推 ${nextTrack.title}。它的 ${nextTrack.tags.slice(0, 2).join(" / ")} 会比较贴近这一刻。`,
    nextTrackId: nextTrack.id,
    mood,
    tags: desiredTags
  };
}

function inferMood(text: string, fallback: string) {
  if (/(温柔|柔|soft|安静|轻|累|雨|慢)/i.test(text)) return "tender";
  if (/(专注|工作|学习|focus|study)/i.test(text)) return "focused";
  if (/(开心|跳舞|能量|dance|嗨|快)/i.test(text)) return "energetic";
  if (/(难过|想念|emo|失眠|深夜)/i.test(text)) return "reflective";
  return fallback;
}

function inferTags(text: string, weatherMain: string) {
  const tags = new Set<string>();
  if (/(雨|rain|温柔|安静|慢)/i.test(text) || weatherMain === "Rain") {
    tags.add("ambient");
    tags.add("lo-fi");
  }
  if (/(工作|学习|专注|focus|study)/i.test(text)) {
    tags.add("study");
    tags.add("jazz hop");
  }
  if (/(跳舞|运动|energy|dance|嗨)/i.test(text)) {
    tags.add("house");
    tags.add("dance");
  }
  if (/(夜|开车|城市|霓虹)/i.test(text)) {
    tags.add("night drive");
    tags.add("synth");
  }
  if (tags.size === 0) {
    tags.add("downtempo");
    tags.add("texture");
  }
  return [...tags];
}

function scoreTrack(track: Track, mood: string, desiredTags: string[], context: DjContext) {
  let score = 0;
  if (track.moods.includes(mood)) score += 6;
  if (track.weather.includes(context.weather.main)) score += 4;
  if (track.timeSlots.includes(context.timeSlot)) score += 3;
  for (const tag of desiredTags) {
    if (track.tags.includes(tag)) score += 5;
  }
  score += Math.max(0, 4 - Math.abs(track.bpm - 96) / 20);
  return score;
}

async function runCodexBrain(input: BrainInput): Promise<CodexJson> {
  const prompt = buildCodexPrompt(input);
  const text = await runCodexAppServer(prompt);
  return parseCodexJson(text);
}

function buildCodexPrompt(input: BrainInput) {
  const compactTracks = input.tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    tags: track.tags,
    moods: track.moods,
    weather: track.weather,
    timeSlots: track.timeSlots,
    bpm: track.bpm
  }));

  return [
    "你是一个本地运行的 24 小时 AI DJ，只负责聊天和选歌。",
    "不要修改文件，不要运行命令，不要输出解释。只输出一个 JSON 对象。",
    'JSON schema: {"reply":"中文主播回复，60 字以内","nextTrackId":"候选歌曲 id","mood":"当前心情标签","tags":["最多 5 个音乐风格标签"]}',
    `当前上下文：${JSON.stringify(input.context)}`,
    `最近聊天：${JSON.stringify(input.history.slice(-6))}`,
    `候选歌曲：${JSON.stringify(compactTracks)}`,
    `用户刚说：${input.message}`
  ].join("\n");
}

function runCodexAppServer(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("codex", ["app-server"], {
      cwd: process.cwd(),
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"]
    });

    let nextId = 1;
    let threadId = "";
    let finalText = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      finish(new Error("Codex brain timed out"));
    }, Number(process.env.CODEX_TIMEOUT_MS ?? 25000));

    const send = (message: Record<string, unknown>) => {
      proc.stdin.write(`${JSON.stringify(message)}\n`);
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      proc.kill();
      if (error) {
        reject(error);
      } else {
        resolve(finalText.trim());
      }
    };

    proc.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    proc.stdout.on("data", (chunk) => {
      for (const raw of String(chunk).split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        let message: any;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if (message.id === 2 && message.result?.thread?.id) {
          threadId = message.result.thread.id;
          send({
            method: "turn/start",
            id: nextId++,
            params: {
              threadId,
              input: [{ type: "text", text: prompt }],
              model: process.env.CODEX_MODEL ?? "gpt-5.4"
            }
          });
        }

        if (message.method === "item/agentMessage/delta") {
          finalText += message.params?.delta ?? "";
        }

        if (message.method === "turn/completed" || message.method === "turn/failed") {
          finish(message.method === "turn/failed" ? new Error("Codex turn failed") : undefined);
        }

        if (message.method?.includes("requestApproval") && message.id) {
          send({ id: message.id, result: { decision: "decline" } });
        }
      }
    });

    proc.on("error", (error) => finish(error));
    proc.on("close", (code) => {
      if (!settled && code !== 0) {
        finish(new Error(stderr || `Codex exited with ${code}`));
      }
    });

    send({
      method: "initialize",
      id: nextId++,
      params: {
        clientInfo: {
          name: "local_ai_dj",
          title: "Local AI DJ",
          version: "0.1.0"
        }
      }
    });
    send({ method: "initialized", params: {} });
    send({
      method: "thread/start",
      id: nextId++,
      params: { model: process.env.CODEX_MODEL ?? "gpt-5.4" }
    });
  });
}

function parseCodexJson(text: string): CodexJson {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
  return JSON.parse(candidate) as CodexJson;
}
