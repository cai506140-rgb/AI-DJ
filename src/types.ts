export type WeatherState = {
  source: "openweather" | "mock";
  city: string;
  main: string;
  description: string;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  updatedAt: string;
};

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

export type DjState = {
  dj: {
    name: string;
    tagline: string;
    bio: string;
    tasteTags: string[];
    brainMode: string;
    brainSource: "codex" | "local";
  };
  context: {
    weather: WeatherState;
    mood: string;
    timeSlot: string;
    localTime: string;
  };
  currentTrack: Track;
  queue: Track[];
  tracks: Track[];
  messages: ChatMessage[];
};

export type ChatResponse = {
  message: ChatMessage;
  brain: {
    source: "codex" | "local";
    reply: string;
    nextTrackId: string;
    mood: string;
    tags: string[];
  };
  state: DjState;
};
