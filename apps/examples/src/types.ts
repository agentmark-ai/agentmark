export interface Weather {
  description: string;
  icon: string;
}

export interface Main {
  temp: number;
  pressure: number;
  humidity: number;
}

export interface WeatherApiResponse {
  weather: Weather[];
  main: Main;
  name: string;
}
