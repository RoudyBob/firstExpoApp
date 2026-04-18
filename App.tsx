import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ZIP_KEY = 'lastZipcode';

type DayForecast = {
  date: string;
  maxTemp: number;
  minTemp: number;
  weatherCode: number;
};

type HourForecast = {
  time: string;
  temp: number;
  weatherCode: number;
};

const WEATHER_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Icy fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ hail',
  99: 'Thunderstorm w/ heavy hail',
};

const WEATHER_EMOJI: Record<number, string> = {
  0: '☀️',
  1: '🌤️',
  2: '⛅',
  3: '☁️',
  45: '🌫️',
  48: '🌫️',
  51: '🌦️',
  53: '🌦️',
  55: '🌧️',
  61: '🌧️',
  63: '🌧️',
  65: '🌧️',
  71: '🌨️',
  73: '❄️',
  75: '❄️',
  80: '🌦️',
  81: '🌦️',
  82: '⛈️',
  95: '⛈️',
  96: '⛈️',
  99: '⛈️',
};

function getWeatherDescription(code: number): string {
  return WEATHER_DESCRIPTIONS[code] ?? 'Unknown';
}

function getWeatherEmoji(code: number): string {
  return WEATHER_EMOJI[code] ?? '🌡️';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatHour(isoTime: string): string {
  const hour = parseInt(isoTime.slice(11, 13), 10);
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

export default function App() {
  const [zipInput, setZipInput] = useState('');
  const [cityName, setCityName] = useState('');
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [hourlyForecast, setHourlyForecast] = useState<HourForecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    AsyncStorage.getItem(LAST_ZIP_KEY).then((saved) => {
      if (saved) {
        setZipInput(saved);
        fetchWeather(saved);
      }
    });
  }, []);

  async function fetchWeather(zip: string) {
    if (!/^\d{5}$/.test(zip)) {
      setError('Please enter a valid 5-digit US zip code.');
      return;
    }
    setLoading(true);
    setError('');
    setForecast([]);
    setHourlyForecast([]);
    setCityName('');
    Keyboard.dismiss();

    try {
      const geoRes = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!geoRes.ok) {
        setError('Zip code not found.');
        setLoading(false);
        return;
      }
      const geoData = await geoRes.json();
      const place = geoData.places[0];
      const lat = parseFloat(place.latitude);
      const lon = parseFloat(place.longitude);
      const city = `${place['place name']}, ${place['state abbreviation']}`;
      setCityName(city);

      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
          `&hourly=weathercode,temperature_2m` +
          `&temperature_unit=fahrenheit&timezone=auto&forecast_days=7`
      );
      const weatherData = await weatherRes.json();
      const days: DayForecast[] = weatherData.daily.time.map((date: string, i: number) => ({
        date,
        maxTemp: Math.round(weatherData.daily.temperature_2m_max[i]),
        minTemp: Math.round(weatherData.daily.temperature_2m_min[i]),
        weatherCode: weatherData.daily.weathercode[i],
      }));
      setForecast(days);
      const hours: HourForecast[] = weatherData.hourly.time.slice(0, 24).map((time: string, i: number) => ({
        time,
        temp: Math.round(weatherData.hourly.temperature_2m[i]),
        weatherCode: weatherData.hourly.weathercode[i],
      }));
      setHourlyForecast(hours);
      await AsyncStorage.setItem(LAST_ZIP_KEY, zip);
    } catch {
      setError('Failed to fetch weather. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.title}>Weather Forecast</Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Enter ZIP code"
            placeholderTextColor="#aaa"
            keyboardType="numeric"
            maxLength={5}
            value={zipInput}
            onChangeText={setZipInput}
            onSubmitEditing={() => fetchWeather(zipInput)}
            returnKeyType="search"
          />
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => fetchWeather(zipInput)}
          >
            <Text style={styles.buttonText}>Go</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && <ActivityIndicator size="large" color="#4A90D9" style={{ marginTop: 32 }} />}

        {cityName && !loading && (
          <Text style={styles.cityName}>{cityName}</Text>
        )}

        {!loading && hourlyForecast.length > 0 && (
          <View style={styles.todayCard}>
            <Text style={styles.todayTitle}>Today</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hourlyScroll}>
              {hourlyForecast.map((h) => (
                <View key={h.time} style={styles.hourBlock}>
                  <Text style={styles.hourLabel}>{formatHour(h.time)}</Text>
                  <Text style={styles.hourEmoji}>{getWeatherEmoji(h.weatherCode)}</Text>
                  <Text style={styles.hourTemp}>{h.temp}°</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {forecast.slice(1).map((item) =>
          !loading ? (
            <View key={item.date} style={styles.card}>
              <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
              <Text style={styles.cardEmoji}>{getWeatherEmoji(item.weatherCode)}</Text>
              <Text style={styles.cardDesc}>{getWeatherDescription(item.weatherCode)}</Text>
              <View style={styles.cardTemps}>
                <Text style={styles.tempHigh}>{item.maxTemp}°</Text>
                <Text style={styles.tempLow}>{item.minTemp}°</Text>
              </View>
            </View>
          ) : null
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAF4FB',
    paddingTop: 64,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A3C5E',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#222',
    borderWidth: 1,
    borderColor: '#cce0f5',
  },
  button: {
    marginLeft: 10,
    height: 48,
    paddingHorizontal: 20,
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: '#357ABD',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#D9534F',
    textAlign: 'center',
    marginBottom: 8,
  },
  cityName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A3C5E',
    textAlign: 'center',
    marginBottom: 12,
  },
  scrollContent: {
    paddingBottom: 32,
    paddingHorizontal: 4,
  },
  todayCard: {
    backgroundColor: '#4A90D9',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  todayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  hourlyScroll: {
    flexDirection: 'row',
  },
  hourBlock: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 44,
  },
  hourLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4,
  },
  hourEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  hourTemp: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDate: {
    width: 90,
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  cardEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  cardDesc: {
    flex: 1,
    fontSize: 13,
    color: '#666',
  },
  cardTemps: {
    flexDirection: 'row',
    gap: 8,
  },
  tempHigh: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A3C5E',
  },
  tempLow: {
    fontSize: 16,
    color: '#999',
  },
});
