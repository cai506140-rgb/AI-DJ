import type { Request, Response } from "express";

export async function synthesizeSpeech(req: Request, res: Response) {
  const text = String(req.body?.text ?? "").trim();
  const apiKey = process.env.FISH_API_KEY;
  const referenceId = process.env.FISH_REFERENCE_ID;

  if (!text) {
    res.status(400).json({ error: "Missing text" });
    return;
  }

  if (!apiKey) {
    res.json({
      mode: "text",
      text,
      message: "FISH_API_KEY is not set; voice output is in text mode."
    });
    return;
  }

  try {
    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        model: "s2-pro"
      },
      body: JSON.stringify({
        text,
        format: "mp3",
        ...(referenceId ? { reference_id: referenceId } : {})
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok || !response.body) {
      throw new Error(`Fish Audio ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    res.status(502).json({
      mode: "text",
      text,
      message: error instanceof Error ? error.message : "Fish Audio request failed"
    });
  }
}
