// 카카오 로컬 API(실제 장소 검색)로 주변 추천을 보강한다.
// KAKAO_REST_API_KEY가 없거나 호출이 실패/타임아웃되면 항상 null을 반환하고,
// 호출부는 null이면 기존 큐레이션 데이터로 조용히 대체한다 (핵심 기능은 절대 깨지지 않음).

const KAKAO_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const KAKAO_BLOG_URL = 'https://dapi.kakao.com/v2/search/blog';

function stripTags(text) {
  return (text || '').replace(/<\/?b>/g, '');
}

// 기분(mood)에 맞는 카카오 검색 키워드
const MOOD_KEYWORD = {
  맛집: '맛집',
  경치: '관광명소',
  힐링: '카페',
  드라이브: '드라이브 명소',
};

async function searchKakaoPlaces({ lat, lng, keyword, radiusM = 15000, size = 5 }) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return null;

  const url = `${KAKAO_SEARCH_URL}?query=${encodeURIComponent(keyword)}&x=${lng}&y=${lat}&radius=${radiusM}&sort=distance&size=${size}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.documents || !data.documents.length) return null;

    return data.documents.map((d) => ({
      name: d.place_name,
      category: (d.category_name || '').split(' > ').pop() || '',
      address: d.road_address_name || d.address_name,
      lat: parseFloat(d.y),
      lng: parseFloat(d.x),
      distanceM: d.distance ? parseInt(d.distance, 10) : null,
      placeUrl: d.place_url,
      phone: d.phone || null,
    }));
  } catch (e) {
    return null;
  }
}

async function searchKakaoNearbyForMood({ lat, lng, mood }) {
  const keyword = MOOD_KEYWORD[mood];
  if (!keyword) return null;
  return searchKakaoPlaces({ lat, lng, keyword });
}

async function searchKakaoBlog(query, size = 2) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey || !query) return null;

  const url = `${KAKAO_BLOG_URL}?query=${encodeURIComponent(query)}&size=${size}&sort=accuracy`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.documents || !data.documents.length) return null;

    return data.documents.map((d) => ({
      title: stripTags(d.title),
      snippet: stripTags(d.contents),
      blogName: d.blogname,
      url: d.url,
      thumbnail: d.thumbnail || null,
    }));
  } catch (e) {
    return null;
  }
}

module.exports = { searchKakaoPlaces, searchKakaoNearbyForMood, searchKakaoBlog };
