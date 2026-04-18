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
const FAVORITES_KEY = 'favorites';

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

type Favorite = {
  zip: string;
  city: string;
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
  const [hourlyByDay, setHourlyByDay] = useState<HourForecast[][]>([]);
  const [expandedDayIndex, setExpandedDayIndex] = useState<number | null>(0);
  const [useCelsius, setUseCelsius] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FAVORITES_KEY),
      AsyncStorage.getItem(LAST_ZIP_KEY),
    ]).then(([savedFavs, savedZip]) => {
      if (savedFavs) setFavorites(JSON.parse(savedFavs));
      if (savedZip) {
        setZipInput(savedZip);
        fetchWeather(savedZip, useCelsius);
      }
    });
  }, []);

  async function fetchWeather(zip: string, celsius = useCelsius) {
    if (!/^\d{5}$/.test(zip)) {
      setError('Please enter a valid 5-digit US zip code.');
      return;
    }
    setLoading(true);
    setError('');
    setForecast([]);
    setHourlyByDay([]);
    setExpandedDayIndex(0);
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
          `&temperature_unit=${celsius ? 'celsius' : 'fahrenheit'}&timezone=auto&forecast_days=7`
      );
      const weatherData = await weatherRes.json();
      const days: DayForecast[] = weatherData.daily.time.map((date: string, i: number) => ({
        date,
        maxTemp: Math.round(weatherData.daily.temperature_2m_max[i]),
        minTemp: Math.round(weatherData.daily.temperature_2m_min[i]),
        weatherCode: weatherData.daily.weathercode[i],
      }));
      setForecast(days);

      const allHours: HourForecast[][] = days.map((_, dayIndex) => {
        const start = dayIndex * 24;
        return weatherData.hourly.time
          .slice(start, start + 24)
          .map((time: string, i: number) => ({
            time,
            temp: Math.round(weatherData.hourly.temperature_2m[start + i]),
            weatherCode: weatherData.hourly.weathercode[start + i],
          }));
      });
      setHourlyByDay(allHours);
      await AsyncStorage.setItem(LAST_ZIP_KEY, zip);
    } catch {
      setError('Failed to fetch weather. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleFavorite() {
    if (!cityName || !zipInput) return;
    const isAlready = favorites.some((f) => f.zip === zipInput);
    const next = isAlready
      ? favorites.filter((f) => f.zip !== zipInput)
      : [...favorites, { zip: zipInput, city: cityName }];
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }

  async function removeFavorite(zip: string) {
    const next = favorites.filter((f) => f.zip !== zip);
    setFavorites(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }

  function toggleUnit() {
    const next = !useCelsius;
    setUseCelsius(next);
    if (cityName) fetchWeather(zipInput, next);
  }

  function toggleDay(dayIndex: number) {
    setExpandedDayIndex((prev) => (prev === dayIndex ? null : dayIndex));
  }

  const todayHours = hourlyByDay[0] ?? [];
  const todayDay = forecast[0];
  const isFavorited = favorites.some((f) => f.zip === zipInput);

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
        <View style={styles.titleRow}>
          <Text style={styles.title}>Weather Forecast</Text>
          <Pressable
            onPress={toggleUnit}
            style={({ pressed }) => [styles.unitToggle, pressed && styles.unitTogglePressed]}
          >
            <Text style={styles.unitToggleText}>{useCelsius ? '°F' : '°C'}</Text>
          </Pressable>
        </View>

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

        {favorites.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.favBar}
            contentContainerStyle={styles.favBarContent}
          >
            {favorites.map((fav) => {
              const isActive = fav.zip === zipInput;
              return (
                <Pressable
                  key={fav.zip}
                  onPress={() => {
                    setZipInput(fav.zip);
                    fetchWeather(fav.zip);
                  }}
                  onLongPress={() => removeFavorite(fav.zip)}
                  style={({ pressed }) => [
                    styles.favPill,
                    isActive && styles.favPillActive,
                    pressed && styles.favPillPressed,
                  ]}
                >
                  <Text
                    style={[styles.favPillText, isActive && styles.favPillTextActive]}
                    numberOfLines={1}
                  >
                    {fav.city}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && <ActivityIndicator size="large" color="#4A90D9" style={{ marginTop: 32 }} />}

        {cityName && !loading && (
          <View style={styles.cityRow}>
            <Text style={styles.cityName}>{cityName}</Text>
            <Pressable onPress={toggleFavorite} style={styles.starButton}>
              <Text style={styles.starIcon}>{isFavorited ? '★' : '☆'}</Text>
            </Pressable>
          </View>
        )}

        {!loading && todayDay && (
          <Pressable
            onPress={() => toggleDay(0)}
            style={({ pressed }) => [
              styles.todayCard,
              expandedDayIndex !== 0 && styles.todayCardCollapsed,
              pressed && styles.cardPressed,
            ]}
          >
            {expandedDayIndex === 0 ? (
              <>
                <Text style={styles.todayTitle}>Today</Text>
                <View style={styles.hourlyContainer}>
                  {todayHours.map((h) => {
                    const isCurrent = parseInt(h.time.slice(11, 13), 10) === new Date().getHours();
                    return (
                      <View key={h.time} style={[styles.hourBlock, isCurrent && styles.hourBlockCurrent]}>
                        <Text style={styles.hourLabel}>{formatHour(h.time)}</Text>
                        <Text style={styles.hourEmoji}>{getWeatherEmoji(h.weatherCode)}</Text>
                        <Text style={styles.hourTemp}>{h.temp}°</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.cardDate, styles.cardDateToday]}>Today</Text>
                <Text style={styles.cardEmoji}>{getWeatherEmoji(todayDay.weatherCode)}</Text>
                <Text style={[styles.cardDesc, styles.cardDescToday]}>{getWeatherDescription(todayDay.weatherCode)}</Text>
                <View style={styles.cardTemps}>
                  <Text style={styles.todayTempHigh}>{todayDay.maxTemp}°</Text>
                  <Text style={styles.todayTempLow}>{todayDay.minTemp}°</Text>
                </View>
              </>
            )}
          </Pressable>
        )}

        {forecast.slice(1).map((item, i) => {
          const dayIndex = i + 1;
          const isExpanded = expandedDayIndex === dayIndex;
          const dayHours = hourlyByDay[dayIndex] ?? [];
          return !loading ? (
            <Pressable
              key={item.date}
              onPress={() => toggleDay(dayIndex)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              {isExpanded ? (
                <>
                  <View style={styles.expandedHeader}>
                    <Text style={styles.expandedDate}>{formatDate(item.date)}</Text>
                    <Text style={styles.expandedTemps}>
                      {item.maxTemp}° / {item.minTemp}°
                    </Text>
                  </View>
                  <View style={styles.hourlyContainer}>
                    {dayHours.map((h) => (
                      <View key={h.time} style={styles.hourBlock}>
                        <Text style={styles.hourLabelDark}>{formatHour(h.time)}</Text>
                        <Text style={styles.hourEmoji}>{getWeatherEmoji(h.weatherCode)}</Text>
                        <Text style={styles.hourTempDark}>{h.temp}°</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.cardDate}>{formatDate(item.date)}</Text>
                  <Text style={styles.cardEmoji}>{getWeatherEmoji(item.weatherCode)}</Text>
                  <Text style={styles.cardDesc}>{getWeatherDescription(item.weatherCode)}</Text>
                  <View style={styles.cardTemps}>
                    <Text style={styles.tempHigh}>{item.maxTemp}°</Text>
                    <Text style={styles.tempLow}>{item.minTemp}°</Text>
                  </View>
                </>
              )}
            </Pressable>
          ) : null;
        })}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A3C5E',
  },
  unitToggle: {
    marginLeft: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#4A90D9',
  },
  unitTogglePressed: {
    backgroundColor: '#dceefa',
  },
  unitToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A90D9',
  },
  inputRow: {
    flexDirection: 'row',
    marginBottom: 10,
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
  favBar: {
    marginBottom: 10,
  },
  favBarContent: {
    paddingVertical: 2,
    gap: 8,
    flexDirection: 'row',
  },
  favPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#cce0f5',
    maxWidth: 160,
  },
  favPillActive: {
    backgroundColor: '#4A90D9',
    borderColor: '#4A90D9',
  },
  favPillPressed: {
    opacity: 0.75,
  },
  favPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A3C5E',
  },
  favPillTextActive: {
    color: '#fff',
  },
  error: {
    color: '#D9534F',
    textAlign: 'center',
    marginBottom: 8,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cityName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A3C5E',
  },
  starButton: {
    marginLeft: 8,
    padding: 4,
  },
  starIcon: {
    fontSize: 22,
    color: '#4A90D9',
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
  todayCardCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  cardDateToday: {
    color: '#fff',
  },
  cardDescToday: {
    color: 'rgba(255,255,255,0.9)',
  },
  todayTempHigh: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  todayTempLow: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  hourlyContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-evenly',
  },
  hourBlock: {
    alignItems: 'center',
    paddingVertical: 4,
    minWidth: 44,
  },
  hourBlockCurrent: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  hourLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4,
  },
  hourLabelDark: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  hourEmoji: {
    fontSize: 26,
    marginBottom: 4,
  },
  hourTemp: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  hourTempDark: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A3C5E',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.85,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  expandedDate: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A3C5E',
  },
  expandedTemps: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
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
