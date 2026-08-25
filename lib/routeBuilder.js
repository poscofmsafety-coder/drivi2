const { roadDistanceKm, driveMinutes } = require('./distance');
const { estimateFuelCost, restStopAdvice } = require('./fuel');

const MAX_STOPS = 3;

function scoreSpot(spot, { mood, season, weatherKind }) {
  let score = 0;
  if (spot.mood_tags.includes(mood)) score += 3;
  if (spot.season_tags.includes(season)) score += 2;
  if (spot.season_tags.includes('사계절')) score += 1;

  const outdoorCategories = ['뷰포인트', '명소'];
  const indoorCategories = ['카페', '맛집'];
  if (weatherKind === 'clear' && outdoorCategories.includes(spot.category)) score += 2;
  if ((weatherKind === 'rain' || weatherKind === 'cloudy' || weatherKind === 'snow') && indoorCategories.includes(spot.category)) score += 2;

  return score;
}

function feasible(usedMin, legTime, visitTime, returnTime, budgetMin) {
  return usedMin + legTime + visitTime + returnTime <= budgetMin;
}

function buildGreedyRoute(origin, pool, budgetMin, roundTrip, context) {
  const scored = pool
    .map((s) => ({ spot: s, score: scoreSpot(s, context), dist: roadDistanceKm(origin, s) }))
    .sort((a, b) => b.score - a.score || a.dist - b.dist);

  const chosen = [];
  let usedMin = 0;
  let lastPoint = origin;
  const usedIds = new Set();

  for (const candidate of scored) {
    if (chosen.length >= MAX_STOPS) break;
    if (usedIds.has(candidate.spot.id)) continue;
    const legDist = roadDistanceKm(lastPoint, candidate.spot);
    const legTime = driveMinutes(legDist);
    const returnDist = roundTrip ? roadDistanceKm(candidate.spot, origin) : 0;
    const returnTime = roundTrip ? driveMinutes(returnDist) : 0;

    if (feasible(usedMin, legTime, candidate.spot.duration_min, returnTime, budgetMin)) {
      chosen.push({ ...candidate.spot, legDistanceKm: legDist, legDriveMinutes: legTime });
      usedMin += legTime + candidate.spot.duration_min;
      lastPoint = candidate.spot;
      usedIds.add(candidate.spot.id);
    }
  }

  return chosen;
}

function summarizeRoute(origin, chosen, roundTrip) {
  let totalDistanceKm = 0;
  let totalDriveMinutes = 0;
  let totalVisitMinutes = 0;

  chosen.forEach((s) => {
    totalDistanceKm += s.legDistanceKm;
    totalDriveMinutes += s.legDriveMinutes;
    totalVisitMinutes += s.duration_min;
  });

  if (roundTrip && chosen.length) {
    const last = chosen[chosen.length - 1];
    const returnDist = roadDistanceKm(last, origin);
    totalDistanceKm += returnDist;
    totalDriveMinutes += driveMinutes(returnDist);
  }

  return { totalDistanceKm, totalDriveMinutes, totalVisitMinutes };
}

function buildRoute({ origin, spots, availableMin, mood, season, weatherKind, roundTrip, companion, excludeIds }) {
  const context = { mood, season, weatherKind };
  const excluded = excludeIds || new Set();
  const petOnly = companion === '애견동반';
  const available = spots.filter((s) => !excluded.has(s.id) && (!petOnly || s.pet_friendly));
  let warning = null;

  if (petOnly && !available.length) {
    return { stops: [], totalDistanceKm: 0, totalDriveMinutes: 0, totalVisitMinutes: 0, totalMinutes: 0, fuelCostWon: 0, restStops: null, warning: 'noMoreOptions' };
  }

  let pool = available.filter((s) => s.mood_tags.includes(mood) && (s.season_tags.includes(season) || s.season_tags.includes('사계절')));
  let chosen = buildGreedyRoute(origin, pool, availableMin, roundTrip, context);

  if (chosen.length === 0) {
    pool = available.filter((s) => s.season_tags.includes(season) || s.season_tags.includes('사계절'));
    chosen = buildGreedyRoute(origin, pool, availableMin, roundTrip, context);
    if (chosen.length) warning = '선택하신 기분(무드)에 딱 맞는 명소는 시간 내에 다녀오기 어려워, 계절에 맞는 다른 명소로 대신 추천했어요.';
  }

  if (chosen.length === 0) {
    pool = available;
    chosen = buildGreedyRoute(origin, pool, availableMin, roundTrip, context);
    if (chosen.length) warning = '조건에 딱 맞는 명소를 찾지 못해, 가장 가까운 명소 위주로 추천했어요.';
  }

  if (chosen.length === 0 && available.length) {
    const nearest = available
      .map((s) => ({ spot: s, dist: roadDistanceKm(origin, s) }))
      .sort((a, b) => a.dist - b.dist)[0];
    const legTime = driveMinutes(nearest.dist);
    chosen = [{ ...nearest.spot, legDistanceKm: nearest.dist, legDriveMinutes: legTime }];
    warning = `설정하신 소요 시간이 짧아 목적지에서 충분히 머물기는 빠듯해요. 가장 가까운 명소(${nearest.spot.name}) 기준으로 예상 일정을 안내해요.`;
  }

  if (chosen.length === 0) {
    return { stops: [], totalDistanceKm: 0, totalDriveMinutes: 0, totalVisitMinutes: 0, totalMinutes: 0, fuelCostWon: 0, restStops: null, warning: 'noMoreOptions' };
  }

  const summary = summarizeRoute(origin, chosen, roundTrip);
  const totalMinutes = summary.totalDriveMinutes + summary.totalVisitMinutes;
  const fuelCostWon = estimateFuelCost(summary.totalDistanceKm);
  const restStops = restStopAdvice(summary.totalDistanceKm);

  const overBudget = totalMinutes > availableMin + 15;
  if (overBudget && !warning) {
    warning = '추천 코스가 설정하신 시간보다 조금 넉넉하게 잡혔어요. 여유를 두고 출발하시길 권해요.';
  }

  return {
    stops: chosen,
    totalDistanceKm: Math.round(summary.totalDistanceKm * 10) / 10,
    totalDriveMinutes: Math.round(summary.totalDriveMinutes),
    totalVisitMinutes: summary.totalVisitMinutes,
    totalMinutes: Math.round(totalMinutes),
    fuelCostWon,
    restStops,
    warning,
  };
}

function buildRouteOptions({ origin, spots, availableMin, mood, season, weatherKind, roundTrip, companion, excludeIds, count = 3 }) {
  const options = [];
  const excluded = new Set(excludeIds || []);

  for (let i = 0; i < count; i += 1) {
    const route = buildRoute({ origin, spots, availableMin, mood, season, weatherKind, roundTrip, companion, excludeIds: excluded });
    if (!route.stops.length) break;
    options.push(route);
    route.stops.forEach((s) => excluded.add(s.id));
  }

  return options;
}

module.exports = { buildRoute, buildRouteOptions };
