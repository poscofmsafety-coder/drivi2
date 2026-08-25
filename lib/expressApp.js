const express = require('express');
const path = require('path');
const { loadSpots } = require('./csv');
const { geocode, reverseGeocode } = require('./geocode');
const { getCurrentWeather, currentSeason } = require('./weather');
const { buildRouteOptions } = require('./routeBuilder');
const { generateCourseTexts } = require('./textgen');
const { fetchDrivingRoute } = require('./routing');
const { estimateFuelCost, restStopAdvice } = require('./fuel');
const { buildNearbyExtras } = require('./nearby');
const { searchKakaoNearbyForMood, searchKakaoBlog } = require('./kakaoLocal');

const app = express();
const SPOTS = loadSpots();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/reverse-geocode', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: '좌표가 올바르지 않습니다.' });
  }
  const name = await reverseGeocode(lat, lng);
  if (!name) return res.status(404).json({ error: '위치 이름을 찾을 수 없어요.' });
  res.json({ name });
});

async function enrichRoute(route, { originPoint, roundTrip, companion, mood, season, weatherKind }) {
  route.roundTrip = roundTrip;

  let geometry = null;
  let routeSource = 'approx';
  const waypoints = [originPoint, ...route.stops];
  if (roundTrip) waypoints.push(originPoint);
  const driving = await fetchDrivingRoute(waypoints);
  if (driving) {
    routeSource = 'osrm';
    geometry = driving.geometry;
    route.totalDistanceKm = Math.round(driving.distanceKm * 10) / 10;
    route.totalDriveMinutes = Math.round(driving.durationMin);
    route.totalMinutes = Math.round(driving.durationMin + route.totalVisitMinutes);
    route.fuelCostWon = estimateFuelCost(driving.distanceKm);
    route.restStops = restStopAdvice(driving.distanceKm);
    driving.legs.forEach((leg, i) => {
      if (route.stops[i]) {
        route.stops[i].legDistanceKm = leg.distanceKm;
        route.stops[i].legDriveMinutes = leg.durationMin;
      }
    });
  }

  const texts = await generateCourseTexts(route, { companion, mood, season, weatherKind });

  // 경유지별 실제 블로그 후기 링크 (실패해도 빈 배열로 조용히 대체 — 핵심 기능에 영향 없음)
  const blogResults = await Promise.all(
    route.stops.map((s) => searchKakaoBlog(`${s.name} ${s.region}`)),
  );

  return {
    roundTrip,
    highlight: texts.highlight,
    tip: texts.tip,
    textSource: texts.source,
    totalDistanceKm: route.totalDistanceKm,
    totalDriveMinutes: route.totalDriveMinutes,
    totalVisitMinutes: route.totalVisitMinutes,
    totalMinutes: route.totalMinutes,
    fuelCostWon: route.fuelCostWon,
    restStops: route.restStops,
    warning: route.warning,
    geometry,
    routeSource,
    stops: route.stops.map((s, i) => ({
      id: s.id,
      order: i + 1,
      name: s.name,
      region: s.region,
      lat: s.lat,
      lng: s.lng,
      category: s.category,
      duration_min: s.duration_min,
      pet_friendly: s.pet_friendly,
      legDistanceKm: Math.round(s.legDistanceKm * 10) / 10,
      legDriveMinutes: Math.round(s.legDriveMinutes),
      description: texts.descriptions[i],
      blogPosts: blogResults[i] || [],
    })),
  };
}

app.post('/api/recommend', async (req, res) => {
  try {
    const { origin, originCoords, minutes, companion, mood, roundTrip, excludeIds } = req.body;

    if (!origin || !minutes || !companion || !mood || typeof roundTrip !== 'boolean') {
      return res.status(400).json({ error: '입력값이 올바르지 않습니다.' });
    }

    let coords;
    if (originCoords && typeof originCoords.lat === 'number' && typeof originCoords.lng === 'number') {
      coords = originCoords;
    } else {
      coords = await geocode(origin);
    }
    if (!coords) {
      return res.status(404).json({ error: `"${origin}" 위치를 찾을 수 없어요. 더 큰 지명(예: 시/군 단위)으로 다시 입력해 보세요.` });
    }

    const originPoint = { name: origin, lat: coords.lat, lng: coords.lng };
    const season = currentSeason();
    const weather = await getCurrentWeather(coords.lat, coords.lng);
    const weatherKind = weather ? weather.kind : 'unknown';

    const routeOptions = buildRouteOptions({
      origin: originPoint,
      spots: SPOTS,
      availableMin: Number(minutes),
      mood,
      season,
      weatherKind,
      roundTrip,
      companion,
      excludeIds: new Set(Array.isArray(excludeIds) ? excludeIds : []),
      count: 3,
    });

    if (!routeOptions.length) {
      return res.json({
        noMoreOptions: true,
        message: '이 조건으로는 더 추천해드릴 새로운 코스가 없어요. 시간이나 기분 조건을 바꿔서 다시 시도해 보세요.',
      });
    }

    const routes = await Promise.all(
      routeOptions.map((route) => enrichRoute(route, { originPoint, roundTrip, companion, mood, season, weatherKind })),
    );

    const allUsedIds = routeOptions.flatMap((r) => r.stops.map((s) => s.id));
    const excludeSet = new Set([...(Array.isArray(excludeIds) ? excludeIds : []), ...allUsedIds]);

    // 카카오 로컬 API로 실제 장소 데이터를 먼저 시도하고, 안 되면 큐레이션 데이터로 대체한다.
    // 애견동반 모드는 카카오 데이터에 반려동반 여부가 없어 안전하게 큐레이션 데이터만 사용한다.
    let nearby = null;
    if (companion !== '애견동반' && (mood === '경치' || mood === '맛집')) {
      const kakaoPlaces = await searchKakaoNearbyForMood({ lat: originPoint.lat, lng: originPoint.lng, mood });
      if (kakaoPlaces && kakaoPlaces.length) {
        nearby = {
          type: mood === '경치' ? 'attraction' : 'restaurant',
          source: 'kakao',
          items: kakaoPlaces.slice(0, 4).map((p) => ({
            name: p.name,
            category: p.category,
            address: p.address,
            distanceKm: p.distanceM != null ? Math.round(p.distanceM / 100) / 10 : null,
            placeUrl: p.placeUrl,
          })),
        };
      }
    }

    if (!nearby) {
      nearby = buildNearbyExtras({
        mood,
        origin: originPoint,
        spots: SPOTS,
        companion,
        excludeIds: excludeSet,
      });
    }

    res.json({
      origin: originPoint,
      season,
      weather,
      roundTrip,
      nearby,
      routes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.' });
  }
});

module.exports = app;
