// 대략적인 국내 평균값으로 추정 (실제 차종/유가에 따라 달라질 수 있음)
const FUEL_EFFICIENCY_KM_PER_L = 12; // 준중형 가솔린 평균 연비 가정
const FUEL_PRICE_WON_PER_L = 1700;

function estimateFuelCost(distanceKm) {
  const liters = distanceKm / FUEL_EFFICIENCY_KM_PER_L;
  return Math.round(liters * FUEL_PRICE_WON_PER_L / 100) * 100;
}

// 장거리 구간에 대해 대략적인 휴게소 이용 권장 지점을 안내 (실제 휴게소 DB 없이 근사)
function restStopAdvice(totalDistanceKm) {
  if (totalDistanceKm < 100) return null;
  const stops = Math.floor(totalDistanceKm / 100);
  const points = [];
  for (let i = 1; i <= stops; i += 1) {
    points.push(i * 100);
  }
  return points;
}

module.exports = { estimateFuelCost, restStopAdvice, FUEL_EFFICIENCY_KM_PER_L, FUEL_PRICE_WON_PER_L };
