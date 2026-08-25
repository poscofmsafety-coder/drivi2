const ORIGIN_SUGGESTIONS = [
  '서울', '인천', '수원', '성남', '고양', '용인', '춘천', '원주', '강릉', '속초',
  '대전', '세종', '천안', '청주', '전주', '군산', '광주', '여수', '순천', '목포',
  '대구', '부산', '울산', '창원', '경주', '포항', '진주', '통영', '제주', '서귀포',
];

const originList = document.getElementById('origin-list');
ORIGIN_SUGGESTIONS.forEach((name) => {
  const opt = document.createElement('option');
  opt.value = name;
  originList.appendChild(opt);
});

const submitBtn = document.getElementById('submit-btn');
const statusHint = document.getElementById('status-hint');
const placeholder = document.getElementById('placeholder');
const resultContent = document.getElementById('result-content');

// --- 칩 그룹(소요시간/동행/기분) ---
function initChipGroup(groupId) {
  const group = document.getElementById(groupId);
  const chips = group.querySelectorAll('.chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      group.dataset.value = chip.dataset.value;
    });
  });
}
['minutes-group', 'companion-group', 'mood-group'].forEach(initChipGroup);

let map = null;
let mapLayer = null;
let currentOriginCoords = null;
let usingGpsOrigin = false;
let cachedMyLocation = null;

function showMyLocation(onFound) {
  if (cachedMyLocation) { onFound(cachedMyLocation); return; }
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      cachedMyLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      onFound(cachedMyLocation);
    },
    () => {},
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
  );
}

function fmtMinutes(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function fmtWon(won) {
  return `약 ${won.toLocaleString('ko-KR')}원`;
}

const WEATHER_EMOJI = { clear: '☀️', cloudy: '☁️', rain: '🌧️', snow: '❄️', unknown: '🌤️' };

// --- 내비게이션 앱 딥링크 ---
const isAndroid = /Android/i.test(navigator.userAgent);
const TMAP_PACKAGE = 'com.skt.tmap.ku';

function tmapUrl(stop) {
  const goalname = encodeURIComponent(stop.name);
  if (isAndroid) {
    // 앱이 없으면 자동으로 플레이스토어로 이동하는 안드로이드 인텐트 방식
    const fallback = encodeURIComponent(`https://play.google.com/store/apps/details?id=${TMAP_PACKAGE}`);
    return `intent://route?goalname=${goalname}&goalx=${stop.lng}&goaly=${stop.lat}#Intent;scheme=tmap;package=${TMAP_PACKAGE};S.browser_fallback_url=${fallback};end`;
  }
  return `tmap://route?goalname=${goalname}&goalx=${stop.lng}&goaly=${stop.lat}`;
}
function kakaoNaviUrl(stop) {
  return `kakaonavi://navigate?name=${encodeURIComponent(stop.name)}&x=${stop.lng}&y=${stop.lat}&coord_type=wgs84`;
}
function kakaoMapWebUrl(stop) {
  return `https://map.kakao.com/link/to/${encodeURIComponent(stop.name)},${stop.lat},${stop.lng}`;
}
function naverMapUrl(stop) {
  return `nmap://route/car?dlat=${stop.lat}&dlng=${stop.lng}&dname=${encodeURIComponent(stop.name)}&appname=drive-course-recommender`;
}

// 네이버지도는 경유지(v1~v5, 최대 5개) 파라미터를 공식 지원해서, 경유지+도착지 전체 경로를 한 번에 넘길 수 있다.
// (티맵은 목적지 1개만, 카카오내비 경유지는 네이티브 SDK 전용이라 웹에서는 못 씀 — 그래서 전체 경로 안내는 네이버지도로만 제공)
function naverFullRouteUrl(origin, stops) {
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1).slice(0, 5);

  const params = new URLSearchParams({
    slat: origin.lat,
    slng: origin.lng,
    sname: origin.name,
    dlat: destination.lat,
    dlng: destination.lng,
    dname: destination.name,
    appname: 'drive-ai-recommender',
  });

  waypoints.forEach((wp, i) => {
    const n = i + 1;
    params.set(`v${n}lat`, wp.lat);
    params.set(`v${n}lng`, wp.lng);
    params.set(`v${n}name`, wp.name);
  });

  return `nmap://route/car?${params.toString()}`;
}

function openWithAppFallback(schemeUrl, webFallbackUrl) {
  let appOpened = false;
  const onHide = () => { if (document.hidden) appOpened = true; };
  document.addEventListener('visibilitychange', onHide);
  window.location.href = schemeUrl;
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (!appOpened && webFallbackUrl) window.location.href = webFallbackUrl;
  }, 1000);
}

// --- 드라이브 이력 (localStorage) ---
const HISTORY_KEY = 'driveHistory';
const HISTORY_MAX = 20;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function getVisitedSpotIds() {
  return [...new Set(loadHistory().map((h) => h.spotId))];
}

function recordHistory(originName, stop) {
  const history = loadHistory();
  history.unshift({
    date: new Date().toISOString(),
    originName,
    spotId: stop.id,
    spotName: stop.name,
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  renderHistory();
}

function fmtHistoryDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderHistory() {
  const history = loadHistory();
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  const clearBtn = document.getElementById('clear-history-btn');

  list.innerHTML = '';

  if (!history.length) {
    empty.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  clearBtn.classList.remove('hidden');

  history.slice(0, 6).forEach((h) => {
    const row = document.createElement('div');
    row.className = 'history-item';
    row.innerHTML = `
      <div class="history-item-name">${h.spotName}</div>
      <div class="history-item-meta">${h.originName} 출발 · ${fmtHistoryDate(h.date)}</div>
    `;
    list.appendChild(row);
  });
}

document.getElementById('clear-history-btn').addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

renderHistory();

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function renderBlogPanel(stops) {
  const panel = document.getElementById('blog-panel');
  const groups = document.getElementById('blog-groups');
  groups.innerHTML = '';

  const withPosts = stops.filter((s) => s.blogPosts && s.blogPosts.length);
  if (!withPosts.length) {
    panel.classList.add('hidden');
    return;
  }

  withPosts.forEach((stop) => {
    const group = document.createElement('div');
    group.className = 'blog-group';

    const cards = stop.blogPosts.map((b) => `
      <a class="blog-card" href="${b.url}" target="_blank" rel="noopener">
        ${b.thumbnail ? `<img class="blog-card-thumb" src="${b.thumbnail}" alt="" loading="lazy">` : '<div class="blog-card-thumb blog-card-thumb-empty">📝</div>'}
        <div class="blog-card-body">
          <span class="blog-card-title">${escapeHtml(b.title)}</span>
          <p class="blog-card-snippet">${escapeHtml(b.snippet)}</p>
          <span class="blog-card-meta">${escapeHtml(b.blogName)}</span>
        </div>
      </a>
    `).join('');

    group.innerHTML = `<div class="blog-group-title">${escapeHtml(stop.name)}</div>${cards}`;
    groups.appendChild(group);
  });

  panel.classList.remove('hidden');
}

const TMAP_ICON_SVG = '<svg class="tmap-icon" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="10" y="12" width="100" height="24" rx="12" fill="url(#tmapGrad)"/><rect x="46" y="12" width="28" height="96" rx="14" fill="url(#tmapGrad)"/></svg>';

function buildNavButtons(stop) {
  return `
    <div class="nav-buttons">
      <button type="button" class="nav-btn tmap" data-nav="tmap">${TMAP_ICON_SVG}티맵</button>
      <button type="button" class="nav-btn kakao" data-nav="kakao">🟡 카카오내비</button>
      <button type="button" class="nav-btn naver" data-nav="naver">🟢 네이버지도</button>
    </div>
  `;
}

function bindNavButtons(container, stop) {
  container.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.nav;
      if (type === 'tmap') window.location.href = tmapUrl(stop);
      if (type === 'kakao') openWithAppFallback(kakaoNaviUrl(stop), kakaoMapWebUrl(stop));
      if (type === 'naver') window.location.href = naverMapUrl(stop);
      if (currentBatch) recordHistory(currentBatch.origin.name, stop);
    });
  });
}

function buildStopCard(stop, isDestination) {
  const el = document.createElement('div');
  el.className = 'stop-card' + (isDestination ? ' destination' : '');
  el.innerHTML = `
    <div class="stop-order${isDestination ? ' destination-order' : ''}">${isDestination ? '🏁' : stop.order}</div>
    <div class="stop-body">
      <div class="stop-title-row">
        <span class="stop-name">${stop.name}</span>
        <span class="stop-category">${stop.category}</span>
        ${isDestination ? '<span class="destination-badge">도착지</span>' : ''}
        ${stop.pet_friendly ? '<span class="pet-badge">🐾 반려견 동반 가능</span>' : ''}
      </div>
      <div class="stop-meta">${stop.region} · 이전 지점에서 ${stop.legDistanceKm}km (약 ${stop.legDriveMinutes}분) · 체류 ${stop.duration_min}분</div>
      <p class="stop-desc">${stop.description}</p>
      ${buildNavButtons(stop)}
    </div>
  `;
  bindNavButtons(el, stop);
  return el;
}

let currentBatch = null;
let selectedIndex = 0;

function renderBatch(data) {
  currentBatch = data;
  selectedIndex = 0;

  document.getElementById('weather-badge').textContent = data.weather
    ? `${WEATHER_EMOJI[data.weather.kind] || ''} ${data.weather.label} · ${Math.round(data.weather.temperature)}°C`
    : '날씨 정보 없음';
  document.getElementById('season-badge').textContent = `${data.season} 추천`;

  renderRouteOptions();
  renderNearby(data.nearby);

  placeholder.classList.add('hidden');
  resultContent.classList.remove('hidden');

  selectRoute(0);
}

function renderRouteOptions() {
  const container = document.getElementById('route-options');
  container.innerHTML = '';

  currentBatch.routes.forEach((route, i) => {
    const stopNames = route.stops.map((s) => s.name).join(' → ');
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'route-option-card' + (i === selectedIndex ? ' selected' : '');
    card.innerHTML = `
      <span class="route-option-label">옵션 ${i + 1}</span>
      <div class="route-option-stops">${stopNames}</div>
      <div class="route-option-stats">${fmtMinutes(route.totalMinutes)} · ${route.totalDistanceKm}km</div>
    `;
    card.addEventListener('click', () => selectRoute(i));
    container.appendChild(card);
  });
}

function selectRoute(i) {
  selectedIndex = i;
  document.querySelectorAll('.route-option-card').forEach((card, idx) => {
    card.classList.toggle('selected', idx === i);
  });
  renderRouteDetail(currentBatch.routes[i]);
}

function renderRouteDetail(route) {
  const data = currentBatch;

  document.getElementById('highlight-text').textContent = route.highlight;
  document.getElementById('warning-text').textContent = route.warning || '';

  document.getElementById('stat-time').textContent = fmtMinutes(route.totalMinutes);
  document.getElementById('stat-distance').textContent = `${route.totalDistanceKm}km`;
  document.getElementById('stat-fuel').textContent = fmtWon(route.fuelCostWon);
  document.getElementById('stat-type').textContent = route.roundTrip ? '왕복' : '편도';

  const waypoints = route.stops.slice(0, -1);
  const destination = route.stops[route.stops.length - 1];

  const waypointsPanel = document.getElementById('waypoints-panel');
  const stopsList = document.getElementById('stops-list');
  stopsList.innerHTML = '';
  if (waypoints.length) {
    waypoints.forEach((stop) => stopsList.appendChild(buildStopCard(stop, false)));
    waypointsPanel.classList.remove('hidden');
  } else {
    waypointsPanel.classList.add('hidden');
  }

  const destList = document.getElementById('destination-list');
  destList.innerHTML = '';
  if (destination) {
    destList.appendChild(buildStopCard(destination, true));
  }

  const navNote = document.createElement('p');
  navNote.className = 'nav-note';
  navNote.textContent = '내비게이션 버튼은 휴대폰에 해당 앱이 설치되어 있어야 정상적으로 열려요.';
  destList.appendChild(navNote);

  document.getElementById('tip-text').textContent = route.tip;

  const tmapCta = document.getElementById('tmap-cta');
  const tmapCtaNote = document.getElementById('tmap-cta-note');
  const naverFullCta = document.getElementById('naver-full-cta');
  const hasWaypoints = route.stops.length > 1;

  if (route.stops.length) {
    tmapCta.classList.remove('hidden');
    tmapCta.onclick = () => {
      window.location.href = tmapUrl(route.stops[0]);
      recordHistory(data.origin.name, route.stops[0]);
    };
    tmapCtaNote.textContent = hasWaypoints
      ? '⚠️ 티맵은 목적지를 1개만 안내해요. 우선 첫 번째 경유지로 안내하고, 도착 후 다음 카드의 버튼을 눌러 이어가세요.'
      : '';
  } else {
    tmapCta.classList.add('hidden');
    tmapCtaNote.textContent = '';
  }

  if (hasWaypoints) {
    naverFullCta.classList.remove('hidden');
    naverFullCta.onclick = () => {
      window.location.href = naverFullRouteUrl(data.origin, route.stops);
      route.stops.forEach((s) => recordHistory(data.origin.name, s));
    };
  } else {
    naverFullCta.classList.add('hidden');
  }

  renderBlogPanel(route.stops);
  renderMap({ origin: data.origin, roundTrip: route.roundTrip, stops: route.stops, geometry: route.geometry });
}

function renderNearby(nearby) {
  const section = document.getElementById('nearby-section');
  const scroll = document.getElementById('nearby-scroll');
  scroll.innerHTML = '';

  if (!nearby || !nearby.items.length) {
    section.classList.add('hidden');
    return;
  }

  const isKakao = nearby.source === 'kakao';
  const baseTitle = nearby.type === 'attraction' ? '🏞️ 주변 경치 좋은 곳 더보기' : '🍽️ 주변 평점 높은 맛집·카페';
  document.getElementById('nearby-title').textContent = isKakao ? `${baseTitle} (카카오맵 실시간)` : baseTitle;

  nearby.items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'nearby-card';
    if (isKakao) {
      card.innerHTML = `
        <div class="nearby-card-name">${item.name}</div>
        <div class="nearby-card-meta">
          <span>${item.category || ''}</span>
          <span>· ${item.distanceKm != null ? `${item.distanceKm}km` : ''}</span>
        </div>
        <p class="nearby-card-desc">${item.address || ''}</p>
        ${item.placeUrl ? `<a class="nearby-card-link" href="${item.placeUrl}" target="_blank" rel="noopener">카카오맵에서 보기 →</a>` : ''}
      `;
    } else {
      card.innerHTML = `
        <div class="nearby-card-name">${item.name}</div>
        <div class="nearby-card-meta">
          <span class="nearby-card-rating">⭐ ${item.rating.toFixed(1)}</span>
          <span>· ${item.distanceKm}km</span>
        </div>
        <p class="nearby-card-desc">${item.highlight_hint}</p>
      `;
    }
    scroll.appendChild(card);
  });

  section.classList.remove('hidden');
}

const MY_LOCATION_ICON = L.divIcon({
  className: 'my-location-marker',
  html: '<span class="my-location-dot"></span>',
  iconSize: [16, 16],
});

function renderMap(data) {
  const mapEl = document.getElementById('map');
  if (!map) {
    map = L.map(mapEl);
  }
  if (mapLayer) {
    mapLayer.clearLayers();
  } else {
    mapLayer = L.layerGroup().addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
  }

  const points = [data.origin, ...data.stops];
  if (data.roundTrip) points.push(data.origin);
  const latlngs = points.map((p) => [p.lat, p.lng]);

  L.marker([data.origin.lat, data.origin.lng], { title: '출발지' })
    .addTo(mapLayer)
    .bindPopup(`<b>출발</b><br>${data.origin.name}`);

  data.stops.forEach((s) => {
    L.marker([s.lat, s.lng], { title: s.name })
      .addTo(mapLayer)
      .bindPopup(`<b>${s.order}. ${s.name}</b><br>${s.category}`);
  });

  // 실제 도로 경로(geometry)가 있으면 그대로, 없으면 직선으로 대체 표시
  const routeLine = data.geometry && data.geometry.length ? data.geometry : latlngs;
  L.polyline(routeLine, { color: '#4f7cff', weight: 4, opacity: 0.85 }).addTo(mapLayer);

  const bounds = L.latLngBounds(latlngs);

  showMyLocation((coords) => {
    L.marker([coords.lat, coords.lng], { icon: MY_LOCATION_ICON, title: '내 위치', zIndexOffset: 1000 })
      .addTo(mapLayer)
      .bindPopup('<b>내 위치</b>');
    bounds.extend([coords.lat, coords.lng]);
    map.fitBounds(bounds, { padding: [30, 30] });
  });

  map.fitBounds(bounds, { padding: [30, 30] });
  setTimeout(() => map.invalidateSize(), 100);
}

const retryBtn = document.getElementById('retry-btn');
let seenStopIds = [];

async function requestRecommendation({ excludeIds, triggerBtn, busyText, idleText } = {}) {
  const origin = document.getElementById('origin').value.trim();
  if (!origin) {
    statusHint.textContent = '출발지를 입력해 주세요.';
    document.getElementById('origin').focus();
    return;
  }

  const btn = triggerBtn || submitBtn;
  btn.disabled = true;
  if (busyText) btn.textContent = busyText;
  statusHint.textContent = '';

  const payload = {
    origin,
    minutes: Number(document.getElementById('minutes-group').dataset.value),
    companion: document.getElementById('companion-group').dataset.value,
    mood: document.getElementById('mood-group').dataset.value,
    roundTrip: document.getElementById('roundTrip').checked,
  };
  if (usingGpsOrigin && currentOriginCoords) {
    payload.originCoords = currentOriginCoords;
  }

  let mergedExclude = excludeIds ? [...excludeIds] : [];
  if (document.getElementById('avoidVisited').checked) {
    mergedExclude = [...new Set([...mergedExclude, ...getVisitedSpotIds()])];
  }
  if (mergedExclude.length) {
    payload.excludeIds = mergedExclude;
  }

  try {
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      statusHint.textContent = data.error || '오류가 발생했어요.';
    } else if (data.noMoreOptions) {
      statusHint.textContent = data.message;
    } else {
      const newIds = data.routes.flatMap((r) => r.stops.map((s) => s.id));
      seenStopIds = [...mergedExclude, ...newIds];
      renderBatch(data);
    }
  } catch (err) {
    statusHint.textContent = '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.';
  } finally {
    btn.disabled = false;
    if (idleText) btn.textContent = idleText;
  }
}

submitBtn.addEventListener('click', () => {
  seenStopIds = [];
  requestRecommendation({ triggerBtn: submitBtn, busyText: '코스를 찾는 중...', idleText: '코스 추천받기' });
});

retryBtn.addEventListener('click', () => {
  requestRecommendation({
    excludeIds: seenStopIds,
    triggerBtn: retryBtn,
    busyText: '다른 코스를 찾는 중...',
    idleText: '🔄 다른 조합으로 다시 추천받기',
  });
});

document.getElementById('origin').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitBtn.click();
  }
});

// --- 내 위치를 출발지로 사용 ---
const locateBtn = document.getElementById('locate-btn');
const originInput = document.getElementById('origin');

originInput.addEventListener('input', () => { usingGpsOrigin = false; });

if (!navigator.geolocation) {
  locateBtn.style.display = 'none';
} else {
  locateBtn.addEventListener('click', () => {
    statusHint.textContent = '내 위치를 확인하는 중...';
    locateBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        currentOriginCoords = coords;
        cachedMyLocation = coords;
        try {
          const res = await fetch(`/api/reverse-geocode?lat=${coords.lat}&lng=${coords.lng}`);
          const data = await res.json();
          originInput.value = res.ok && data.name ? data.name : '내 위치';
        } catch (e) {
          originInput.value = '내 위치';
        }
        usingGpsOrigin = true;
        locateBtn.disabled = false;
        statusHint.textContent = '현재 위치를 출발지로 설정했어요.';
      },
      () => {
        locateBtn.disabled = false;
        statusHint.textContent = '위치 권한이 거부되었거나 가져올 수 없어요. 직접 입력해 주세요.';
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

// --- 음성으로 출발지 입력 ---
const micBtn = document.getElementById('mic-btn');
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognitionCtor) {
  micBtn.style.display = 'none';
} else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
  micBtn.addEventListener('click', () => {
    statusHint.textContent = '음성 입력은 보안 연결(https)에서만 사용할 수 있어요. https 주소로 접속해 주세요.';
  });
} else {
  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'ko-KR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  let listening = false;

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
      return;
    }
    statusHint.textContent = '';
    try {
      recognition.start();
    } catch (e) {
      // 이미 시작된 세션이면 무시
    }
  });

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add('listening');
    micBtn.textContent = '🔴';
    statusHint.textContent = '듣고 있어요... 출발지를 말씀해 주세요.';
  };

  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
  };

  recognition.onerror = () => {
    listening = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
    statusHint.textContent = '음성 인식에 실패했어요. 다시 시도하거나 직접 입력해 주세요.';
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.trim();
    originInput.value = transcript;
    statusHint.textContent = `"${transcript}"(으)로 인식했어요.`;
  };
}
