import type { Response } from "express";

const toneMap: Record<string, number> = {
  "rain-window": 196,
  "metro-neon": 246.94,
  "green-tea-break": 220,
  "salt-air-call": 174.61,
  "tiny-warehouse": 261.63,
  "paper-moon": 164.81,
  sunlint: 293.66,
  "blue-hour-cache": 207.65
};

export function sendGeneratedWav(trackId: string, res: Response) {
  const sampleRate = 22050;
  const seconds = 24;
  const totalSamples = sampleRate * seconds;
  const frequency = toneMap[trackId] ?? 220;
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
    const carrier = Math.sin(2 * Math.PI * frequency * t);
    const overtone = Math.sin(2 * Math.PI * frequency * 1.5 * t) * 0.28;
    const pulse = Math.sin(2 * Math.PI * 0.42 * t) * 0.08;
    const sample = Math.max(-1, Math.min(1, (carrier + overtone + pulse) * 0.21 * envelope));
    buffer.writeInt16LE(sample * 32767, 44 + i * 2);
  }

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(buffer);
}
