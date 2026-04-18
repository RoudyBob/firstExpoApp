import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
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
const MAX_FAVORITES = 5;

type CurrentConditions = {
  temp: number;
  feelsLike: number;
  weatherCode: number;
};

type DayForecast = {
  date: string;
  maxTemp: number;
  minTemp: number;
  weatherCode: number;
  precipProbMax: number;
};

type HourForecast = {
  time: string;
  temp: number;
  feelsLike: number;
  weatherCode: number;
  precipProb: number;
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

function HourlyScroll({ contentContainerStyle, initialOffsetX = 0, children }: {
  contentContainerStyle?: object;
  initialOffsetX?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    if (initialOffsetX > 0 && ref.current) {
      ref.current.scrollTo({ x: initialOffsetX, animated: false });
    }
  }, [initialOffsetX]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    const node = (ref.current as any).getScrollableNode?.();
    if (!node) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      node.scrollLeft += e.deltaY;
    };
    node.addEventListener('wheel', handler, { passive: false });
    return () => node.removeEventListener('wheel', handler);
  }, []);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </ScrollView>
  );
}

export default function App() {
  const [zipInput, setZipInput] = useState('');
  const [cityName, setCityName] = useState('');
  const [current, setCurrent] = useState<CurrentConditions | null>(null);
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
    setCurrent(null);
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

      const unit = celsius ? 'celsius' : 'fahrenheit';
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,apparent_temperature,weathercode` +
          `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
          `&hourly=weathercode,temperature_2m,apparent_temperature,precipitation_probability` +
          `&temperature_unit=${unit}&timezone=auto&forecast_days=7`
      );
      const weatherData = await weatherRes.json();

      setCurrent({
        temp: Math.round(weatherData.current.temperature_2m),
        feelsLike: Math.round(weatherData.current.apparent_temperature),
        weatherCode: weatherData.current.weathercode,
      });

      const days: DayForecast[] = weatherData.daily.time.map((date: string, i: number) => ({
        date,
        maxTemp: Math.round(weatherData.daily.temperature_2m_max[i]),
        minTemp: Math.round(weatherData.daily.temperature_2m_min[i]),
        weatherCode: weatherData.daily.weathercode[i],
        precipProbMax: weatherData.daily.precipitation_probability_max[i] ?? 0,
      }));
      setForecast(days);

      const allHours: HourForecast[][] = days.map((_, dayIndex) => {
        const start = dayIndex * 24;
        return weatherData.hourly.time
          .slice(start, start + 24)
          .map((time: string, i: number) => ({
            time,
            temp: Math.round(weatherData.hourly.temperature_2m[start + i]),
            feelsLike: Math.round(weatherData.hourly.apparent_temperature[start + i]),
            weatherCode: weatherData.hourly.weathercode[start + i],
            precipProb: weatherData.hourly.precipitation_probability[start + i] ?? 0,
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
  const canAddFavorite = !isFavorited && favorites.length < MAX_FAVORITES;
  const unit = useCelsius ? '°C' : '°F';

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
            {(isFavorited || canAddFavorite) && (
              <Pressable onPress={toggleFavorite} style={styles.starButton}>
                <Text style={styles.starIcon}>{isFavorited ? '★' : '☆'}</Text>
              </Pressable>
            )}
          </View>
        )}

        {!loading && current && forecast[0] && (
          <View style={styles.overviewCard}>
            <Text style={[styles.overviewLabel, styles.overviewLabelNow]}>Now</Text>
            <Text style={styles.overviewEmoji}>{getWeatherEmoji(current.weatherCode)}</Text>
            <Text style={styles.overviewDesc}>{getWeatherDescription(current.weatherCode)}</Text>
            <View style={styles.overviewRight}>
              {forecast[0].precipProbMax > 0 && (
                <Text style={styles.overviewPrecip}>💧{forecast[0].precipProbMax}%</Text>
              )}
              <Text style={styles.overviewTempMain}>{current.temp}°</Text>
              <Text style={styles.overviewTempSub}>FL {current.feelsLike}°</Text>
            </View>
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
                <HourlyScroll contentContainerStyle={styles.hourlyContainer} initialOffsetX={new Date().getHours() * 56}>
                  {todayHours.map((h) => {
                    const isCurrent = parseInt(h.time.slice(11, 13), 10) === new Date().getHours();
                    return (
                      <View key={h.time} style={[styles.hourBlock, isCurrent && styles.hourBlockCurrent]}>
                        <Text style={styles.hourLabel}>{formatHour(h.time)}</Text>
                        <Text style={styles.hourEmoji}>{getWeatherEmoji(h.weatherCode)}</Text>
                        <Text style={styles.hourTemp}>{h.temp}°</Text>
                        <Text style={styles.hourFeelsLike}>FL {h.feelsLike}°</Text>
                        {h.precipProb > 0 && (
                          <Text style={styles.hourPrecip}>💧{h.precipProb}%</Text>
                        )}
                      </View>
                    );
                  })}
                </HourlyScroll>
              </>
            ) : (
              <View style={styles.overviewRow}>
                <Text style={[styles.overviewLabel, styles.overviewLabelToday]}>Today</Text>
                <Text style={styles.overviewEmoji}>{getWeatherEmoji(todayDay.weatherCode)}</Text>
                <Text style={[styles.overviewDesc, styles.overviewDescToday]}>{getWeatherDescription(todayDay.weatherCode)}</Text>
                <View style={styles.overviewRight}>
                  {todayDay.precipProbMax > 0 && (
                    <Text style={[styles.overviewPrecip, styles.overviewPrecipToday]}>💧{todayDay.precipProbMax}%</Text>
                  )}
                  <Text style={[styles.overviewTempMain, styles.overviewTempMainToday]}>{todayDay.maxTemp}°</Text>
                  <Text style={[styles.overviewTempSub, styles.overviewTempSubToday]}>{todayDay.minTemp}°</Text>
                </View>
              </View>
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
                    <View style={styles.expandedRight}>
                      {item.precipProbMax > 0 && (
                        <Text style={styles.expandedPrecip}>💧{item.precipProbMax}%</Text>
                      )}
                      <Text style={styles.expandedTemps}>
                        {item.maxTemp}° / {item.minTemp}°
                      </Text>
                    </View>
                  </View>
                  <HourlyScroll contentContainerStyle={styles.hourlyContainer}>
                    {dayHours.map((h) => (
                      <View key={h.time} style={styles.hourBlock}>
                        <Text style={styles.hourLabelDark}>{formatHour(h.time)}</Text>
                        <Text style={styles.hourEmoji}>{getWeatherEmoji(h.weatherCode)}</Text>
                        <Text style={styles.hourTempDark}>{h.temp}°</Text>
                        <Text style={styles.hourFeelsLikeDark}>FL {h.feelsLike}°</Text>
                        {h.precipProb > 0 && (
                          <Text style={styles.hourPrecipDark}>💧{h.precipProb}%</Text>
                        )}
                      </View>
                    ))}
                  </HourlyScroll>
                </>
              ) : (
                <View style={styles.overviewRow}>
                  <Text style={styles.overviewLabel}>{formatDate(item.date)}</Text>
                  <Text style={styles.overviewEmoji}>{getWeatherEmoji(item.weatherCode)}</Text>
                  <Text style={styles.overviewDesc}>{getWeatherDescription(item.weatherCode)}</Text>
                  <View style={styles.overviewRight}>
                    {item.precipProbMax > 0 && (
                      <Text style={styles.overviewPrecip}>💧{item.precipProbMax}%</Text>
                    )}
                    <Text style={styles.overviewTempMain}>{item.maxTemp}°</Text>
                    <Text style={styles.overviewTempSub}>{item.minTemp}°</Text>
                  </View>
                </View>
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
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  overviewCard: {
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
  overviewLabel: {
    width: 90,
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  overviewLabelNow: {
    color: '#4A90D9',
    fontWeight: '700',
  },
  overviewLabelToday: {
    color: '#fff',
  },
  overviewEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  overviewDesc: {
    flex: 1,
    fontSize: 13,
    color: '#666',
  },
  overviewDescToday: {
    color: 'rgba(255,255,255,0.9)',
  },
  overviewRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewRight: {
    alignItems: 'flex-end',
  },
  overviewPrecip: {
    fontSize: 12,
    color: '#5b9bd5',
    marginBottom: 2,
  },
  overviewPrecipToday: {
    color: 'rgba(255,255,255,0.85)',
  },
  overviewTempMain: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A3C5E',
  },
  overviewTempMainToday: {
    color: '#fff',
  },
  overviewTempSub: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  overviewTempSubToday: {
    color: 'rgba(255,255,255,0.7)',
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
  hourlyContainer: {
    flexDirection: 'row',
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  hourBlock: {
    alignItems: 'center',
    paddingVertical: 4,
    width: 56,
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
  hourFeelsLike: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  hourFeelsLikeDark: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 2,
  },
  hourPrecip: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  hourPrecipDark: {
    fontSize: 11,
    color: '#5b9bd5',
    marginTop: 2,
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
  expandedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandedPrecip: {
    fontSize: 13,
    color: '#5b9bd5',
  },
  expandedTemps: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
});
