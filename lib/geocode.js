// 자주 쓰는 출발지는 로컬 표에서 바로 매칭하고, 없으면 OSM Nominatim(무료, 키 불필요)으로 조회한다.
const LOCAL_PLACES = {
  '서울': { lat: 37.5665, lng: 126.9780 },
  '서울역': { lat: 37.5547, lng: 126.9707 },
  '강남': { lat: 37.4979, lng: 127.0276 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '수원': { lat: 37.2636, lng: 127.0286 },
  '성남': { lat: 37.4201, lng: 127.1265 },
  '고양': { lat: 37.6584, lng: 126.8320 },
  '용인': { lat: 37.2411, lng: 127.1776 },
  '춘천': { lat: 37.8813, lng: 127.7298 },
  '원주': { lat: 37.3422, lng: 127.9202 },
  '강릉': { lat: 37.7519, lng: 128.8761 },
  '속초': { lat: 38.2070, lng: 128.5918 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '세종': { lat: 36.4801, lng: 127.2890 },
  '천안': { lat: 36.8151, lng: 127.1139 },
  '청주': { lat: 36.6424, lng: 127.4890 },
  '전주': { lat: 35.8242, lng: 127.1480 },
  '군산': { lat: 35.9678, lng: 126.7369 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '여수': { lat: 34.7604, lng: 127.6622 },
  '순천': { lat: 34.9506, lng: 127.4872 },
  '목포': { lat: 34.8118, lng: 126.3922 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '창원': { lat: 35.2280, lng: 128.6811 },
  '경주': { lat: 35.8562, lng: 129.2247 },
  '포항': { lat: 36.0190, lng: 129.3435 },
  '진주': { lat: 35.1800, lng: 128.1076 },
  '통영': { lat: 34.8544, lng: 128.4331 },
  '제주': { lat: 33.4996, lng: 126.5312 },
  '제주시': { lat: 33.4996, lng: 126.5312 },
  '서귀포': { lat: 33.2541, lng: 126.5601 },
};

function localLookup(query) {
  const q = query.trim();
  if (LOCAL_PLACES[q]) return LOCAL_PLACES[q];
  const key = Object.keys(LOCAL_PLACES).find((k) => q.includes(k) || k.includes(q));
  return key ? LOCAL_PLACES[key] : null;
}

async function nominatimLookup(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=kr&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'drive-course-recommender-demo/1.0' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&accept-language=ko`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'drive-course-recommender-demo/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    const name = addr.town || addr.city || addr.county || addr.village || addr.borough
      || (data.display_name ? data.display_name.split(',')[0] : null);
    return name || '내 위치';
  } catch (e) {
    return null;
  }
}

async function geocode(query) {
  const local = localLookup(query);
  if (local) return { ...local, source: 'local' };
  try {
    const remote = await nominatimLookup(query);
    if (remote) return { ...remote, source: 'nominatim' };
  } catch (e) {
    // 네트워크 실패 시 무시하고 아래에서 null 처리
  }
  return null;
}

module.exports = { geocode, reverseGeocode, LOCAL_PLACES };
