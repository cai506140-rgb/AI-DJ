import type { ChatResponse, DjState } from "./types";

export async function fetchState(): Promise<DjState> {
  const response = await fetch("/api/state");
  if (!response.ok) throw new Error("State request failed");
  return response.json();
}

export async function sendChat(message: string): Promise<ChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!response.ok) throw new Error("Chat request failed");
  return response.json();
}

export async function nextTrack(): Promise<DjState> {
  const response = await fetch("/api/playlist/next", { method: "POST" });
  if (!response.ok) throw new Error("Next track request failed");
  return response.json();
}

export async function selectTrack(trackId: string): Promise<DjState> {
  const response = await fetch("/api/playlist/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId })
  });
  if (!response.ok) throw new Error("Select track request failed");
  return response.json();
}

export async function speak(text: string): Promise<"audio" | "text"> {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!response.ok) return "text";

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("audio")) {
    return "text";
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url));
  await audio.play();
  return "audio";
}
