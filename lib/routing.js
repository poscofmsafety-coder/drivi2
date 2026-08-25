// OSRM 공개 데모 서버로 실제 도로 기반 경로(거리/시간/좌표열)를 가져온다. 키 불필요.
// 데모 서버는 요청량 제한이 있으므로 실패 시 호출부에서 직선거리 근사치로 대체해야 한다.
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

async function fetchDrivingRoute(points) {
  if (!points || points.length < 2) return null;
  const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/${coordStr}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes || !data.routes.length) return null;
    const route = data.routes[0];
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      legs: route.legs.map((leg) => ({
        distanceKm: leg.distance / 1000,
        durationMin: leg.duration / 60,
      })),
    };
  } catch (e) {
    return null;
  }
}

module.exports = { fetchDrivingRoute };
