// "LLM 역할" 담당 모듈: 명소 소개 문구 / 코스 하이라이트 / 드라이브 팁 생성
// ANTHROPIC_API_KEY가 설정되어 있으면 실제 LLM 호출, 없으면 템플릿 기반으로 자연스러운 문구를 만든다.

const MOOD_PHRASE = {
  드라이브: '시원하게 달리기 좋은',
  경치: '눈이 즐거운',
  맛집: '입이 즐거운',
  힐링: '마음이 편안해지는',
};

const COMPANION_PHRASE = {
  혼자: '혼자만의 여유를 즐기기 좋은',
  커플: '둘만의 추억을 쌓기 좋은',
  친구: '친구와 함께 웃고 떠들기 좋은',
  가족: '온 가족이 함께 즐기기 좋은',
  애견동반: '반려견과 함께 산책하기 좋은',
};

const WEATHER_TIP = {
  clear: '맑은 날씨라 전망 좋은 뷰포인트를 즐기기 딱이에요. 햇빛이 강할 수 있으니 선글라스를 챙기세요.',
  cloudy: '흐린 날씨라 야외보다는 카페·맛집 위주로 코스를 짰어요. 우산을 챙기면 더 안심돼요.',
  rain: '비 소식이 있어 실내 위주 코스로 구성했어요. 와이퍼와 김서림 방지도 미리 점검하세요.',
  snow: '눈길이 있을 수 있어요. 미리 스노우체인이나 겨울용 타이어를 점검하고 서행하세요.',
  unknown: '출발 전 최신 날씨를 한 번 더 확인하고 출발하세요.',
};

function spotDescription(spot) {
  return `${spot.name}(${spot.region}) — ${spot.highlight_hint}. 머무는 시간은 약 ${spot.duration_min}분을 추천해요.`;
}

function courseHighlight({ stops, mood, companion, roundTrip }) {
  const moodPhrase = MOOD_PHRASE[mood] || '기분 좋은';
  const companionPhrase = COMPANION_PHRASE[companion] || '함께하기 좋은';
  const stopNames = stops.map((s) => s.name).join(' → ');
  const tripType = roundTrip ? '왕복' : '편도';
  return `${companionPhrase} ${moodPhrase} ${tripType} 드라이브 코스예요. ${stopNames} 순서로 둘러보세요.`;
}

function driveTip({ weatherKind, restStops }) {
  const base = WEATHER_TIP[weatherKind] || WEATHER_TIP.unknown;
  const restPart = restStops && restStops.length
    ? ` 총 주행거리가 있는 편이니 약 ${restStops[0]}km 지점 즈음에서 휴게소에 들러 쉬어가는 걸 추천해요.`
    : '';
  return base + restPart;
}

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content && data.content[0] ? data.content[0].text.trim() : null;
  } catch (e) {
    return null;
  }
}

async function generateCourseTexts(route, context) {
  const { stops } = route;
  const useLLM = !!process.env.ANTHROPIC_API_KEY;

  if (useLLM) {
    const prompt = `너는 드라이브 코스 추천 서비스의 카피라이터야. 아래 정보를 참고해서 JSON으로만 답해줘.
형식: {"highlight": "코스 전체를 소개하는 한 문장", "tip": "드라이브 팁 한두 문장", "descriptions": {"스팟명": "소개 문구"}}
동행: ${context.companion}, 기분: ${context.mood}, 계절: ${context.season}, 날씨: ${context.weatherKind}, 왕복여부: ${route.roundTrip ? '왕복' : '편도'}
경유지: ${stops.map((s) => `${s.name}(${s.highlight_hint})`).join(', ')}`;
    const llmText = await callAnthropic(prompt);
    if (llmText) {
      try {
        const parsed = JSON.parse(llmText);
        return {
          highlight: parsed.highlight || courseHighlight({ ...context, stops, roundTrip: route.roundTrip }),
          tip: parsed.tip || driveTip({ ...context, restStops: route.restStops }),
          descriptions: stops.map((s) => (parsed.descriptions && parsed.descriptions[s.name]) || spotDescription(s)),
          source: 'llm',
        };
      } catch (e) {
        // JSON 파싱 실패 시 템플릿으로 폴백
      }
    }
  }

  return {
    highlight: courseHighlight({ ...context, stops, roundTrip: route.roundTrip }),
    tip: driveTip({ ...context, restStops: route.restStops }),
    descriptions: stops.map((s) => spotDescription(s)),
    source: 'template',
  };
}

module.exports = { generateCourseTexts };
