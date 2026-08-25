const { roadDistanceKm } = require('./distance');

const NEARBY_RADIUS_KM = 70;
const MAX_ITEMS = 4;

// 기분(mood)에 따라 코스에 포함되지 않은 주변 추천 목록을 별도로 보여준다.
// 경치 -> 주변 경치 좋은 관광지, 맛집 -> 주변 평점 높은 맛집/카페
function buildNearbyExtras({ mood, origin, spots, excludeIds, companion }) {
  let categories;
  let sortBy;

  if (mood === '경치') {
    categories = ['뷰포인트', '명소'];
    sortBy = 'distance';
  } else if (mood === '맛집') {
    categories = ['맛집', '카페'];
    sortBy = 'rating';
  } else {
    return null;
  }

  const petOnly = companion === '애견동반';
  const candidates = spots
    .filter((s) => categories.includes(s.category) && !excludeIds.has(s.id) && (!petOnly || s.pet_friendly))
    .map((s) => ({ ...s, distanceKm: roadDistanceKm(origin, s) }))
    .filter((s) => s.distanceKm <= NEARBY_RADIUS_KM);

  candidates.sort((a, b) => {
    if (sortBy === 'rating') return b.rating - a.rating || a.distanceKm - b.distanceKm;
    return a.distanceKm - b.distanceKm;
  });

  const top = candidates.slice(0, MAX_ITEMS);
  if (!top.length) return null;

  return {
    type: mood === '경치' ? 'attraction' : 'restaurant',
    items: top.map((s) => ({
      name: s.name,
      region: s.region,
      lat: s.lat,
      lng: s.lng,
      category: s.category,
      rating: s.rating,
      pet_friendly: s.pet_friendly,
      distanceKm: Math.round(s.distanceKm * 10) / 10,
      highlight_hint: s.highlight_hint,
    })),
  };
}

module.exports = { buildNearbyExtras };
