// rating: 리뷰 API 없이 큐레이션한 참고용 점수(실시간 크라우드 평점이 아님)
const fs = require('fs');
const path = require('path');

function loadSpots() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'data', 'spots.csv'), 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (cols[i] || '').trim(); });
    return {
      id: row.id,
      name: row.name,
      region: row.region,
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      category: row.category,
      duration_min: parseInt(row.duration_min, 10),
      season_tags: row.season_tags.split(';').filter(Boolean),
      mood_tags: row.mood_tags.split(';').filter(Boolean),
      highlight_hint: row.highlight_hint,
      rating: parseFloat(row.rating),
      pet_friendly: row.pet_friendly === 'Y',
    };
  });
}

module.exports = { loadSpots };
