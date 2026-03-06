import { createElevenLabsAdapters } from "glove-voice";

async function fetchToken(path: string): Promise<string> {
  const res = await fetch(path);
  const data = await res.json();
  return data.token;
}

export const { stt, createTTS } = createElevenLabsAdapters({
  getSTTToken: () => fetchToken("/api/voice/stt-token"),
  getTTSToken: () => fetchToken("/api/voice/tts-token"),
  voiceId: "vQ2xJ0HUjdmWkVVJK2eI",
});
