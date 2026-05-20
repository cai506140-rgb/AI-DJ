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

let cachedWeather: { value: WeatherState; expiresAt: number } | null = null;

export async function getWeather(): Promise<WeatherState> {
  const now = Date.now();
  if (cachedWeather && cachedWeather.expiresAt > now) {
    return cachedWeather.value;
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;
  const lat = process.env.OPENWEATHER_LAT ?? "31.2304";
  const lon = process.env.OPENWEATHER_LON ?? "121.4737";

  if (!apiKey) {
    return cache({
      source: "mock",
      city: "Localhost",
      main: "Clouds",
      description: "多云，有一点适合整理心情的风",
      temperatureC: 23,
      feelsLikeC: 22,
      humidity: 68,
      updatedAt: new Date().toISOString()
    });
  }

  try {
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("units", "metric");
    url.searchParams.set("lang", "zh_cn");

    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) {
      throw new Error(`OpenWeather ${response.status}`);
    }
    const body = (await response.json()) as any;
    return cache({
      source: "openweather",
      city: body.name ?? "Current location",
      main: body.weather?.[0]?.main ?? "Clouds",
      description: body.weather?.[0]?.description ?? "天气数据已更新",
      temperatureC: Math.round(body.main?.temp ?? 23),
      feelsLikeC: Math.round(body.main?.feels_like ?? body.main?.temp ?? 23),
      humidity: body.main?.humidity ?? 60,
      updatedAt: new Date().toISOString()
    });
  } catch {
    return cache({
      source: "mock",
      city: "Localhost",
      main: "Clouds",
      description: "天气接口暂时没接通，先按多云处理",
      temperatureC: 23,
      feelsLikeC: 22,
      humidity: 68,
      updatedAt: new Date().toISOString()
    });
  }
}

function cache(value: WeatherState): WeatherState {
  cachedWeather = { value, expiresAt: Date.now() + 10 * 60 * 1000 };
  return value;
}
