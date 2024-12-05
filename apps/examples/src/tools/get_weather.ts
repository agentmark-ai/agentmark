import fetch from 'node-fetch';
import { BASE_URL } from '../config';
import { WeatherApiResponse } from '../types';

export async function getWeatherByCity({ location }: { location: string }): Promise<WeatherApiResponse> {
  const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
  const url = `${BASE_URL}?q=${encodeURIComponent(location)}&appid=${WEATHER_API_KEY}&units=metric`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Error fetching weather data: ${response.statusText}`);
  }

  const data: WeatherApiResponse = await response.json();
  return data;
}
