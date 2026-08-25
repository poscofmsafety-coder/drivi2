// Open-Meteo: 키 없이 쓸 수 있는 무료 날씨 API
function classifyWeatherCode(code) {
  if (code === 0) return { label: '맑음', kind: 'clear' };
  if ([1, 2].includes(code)) return { label: '대체로 맑음', kind: 'clear' };
  if (code === 3) return { label: '흐림', kind: 'cloudy' };
  if ([45, 48].includes(code)) return { label: '안개', kind: 'cloudy' };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: '비', kind: 'rain' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '눈', kind: 'snow' };
  if ([95, 96, 99].includes(code)) return { label: '뇌우', kind: 'rain' };
  return { label: '알 수 없음', kind: 'unknown' };
}

async function getCurrentWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=Asia%2FSeoul`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const cw = data.current_weather;
    if (!cw) return null;
    const info = classifyWeatherCode(cw.weathercode);
    return {
      temperature: cw.temperature,
      windspeed: cw.windspeed,
      ...info,
    };
  } catch (e) {
    return null;
  }
}

function currentSeason(date = new Date()) {
  const m = date.getMonth() + 1;
  if (m >= 3 && m <= 5) return '봄';
  if (m >= 6 && m <= 8) return '여름';
  if (m >= 9 && m <= 11) return '가을';
  return '겨울';
}

module.exports = { getCurrentWeather, currentSeason };
