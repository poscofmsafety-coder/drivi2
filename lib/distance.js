const EARTH_RADIUS_KM = 6371;
// 직선거리를 실제 도로 주행거리로 근사할 때 곱하는 보정계수 (곡선/우회 반영 경험치)
const ROAD_FACTOR = 1.3;
const AVG_SPEED_KMH = 60;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function straightLineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

function roadDistanceKm(a, b) {
  return straightLineKm(a, b) * ROAD_FACTOR;
}

function driveMinutes(distanceKm) {
  return (distanceKm / AVG_SPEED_KMH) * 60;
}

module.exports = { straightLineKm, roadDistanceKm, driveMinutes, AVG_SPEED_KMH, ROAD_FACTOR };
