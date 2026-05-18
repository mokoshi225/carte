/* =================================================================
   chart.js — Canvas 2D グラフ描画モジュール v1.3.0
   8項目（受診SBP/DBP, 家庭平均/最小/最大SBP/DBP）の時系列折れ線
   ================================================================= */

const BP_ITEMS = [
  { key: 'systolic',  label: '受診SBP', color: '#c0392b', lineWidth: 1.8 },
  { key: 'avgSbp',    label: '家庭SBP平均', color: '#e67e22', lineWidth: 2.8 },
  { key: 'minSbp',    label: '家庭SBP最小', color: '#f39c12', lineWidth: 1.0, opacity: 0.45 },
  { key: 'maxSbp',    label: '家庭SBP最大', color: '#e74c3c', lineWidth: 1.0, opacity: 0.45 },
  { key: 'diastolic', label: '受診DBP', color: '#2980b9', lineWidth: 1.8 },
  { key: 'avgDbp',    label: '家庭DBP平均', color: '#27ae60', lineWidth: 2.8 },
  { key: 'minDbp',    label: '家庭DBP最小', color: '#1abc9c', lineWidth: 1.0, opacity: 0.45 },
  { key: 'maxDbp',    label: '家庭DBP最大', color: '#8e44ad', lineWidth: 1.0, opacity: 0.45 },
];

const GRAPH = {
  padding: { top: 30, right: 20, bottom: 45, left: 50 },
  dotRadius: 3.5,
  lineWidth: 1.8,
};

function bpToY(bp, pad, plotH) {
  return pad.top + plotH - ((bp - 60) / (150 - 60)) * plotH;
}

/**
 * 全期間ビュー：8項目の折れ線グラフを描画
 * 警戒線・平均線・レンジ表示は一切なし
 */
function drawAllPeriodGraph(canvas, readings) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width, H = 500;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.height = H + 'px'; canvas.style.width = '100%';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const pad = GRAPH.padding;
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  // チェックボックス：受診時血圧の表示/非表示
  const showVisit = !document.getElementById('chk-show-visit') || document.getElementById('chk-show-visit').checked;
  const activeItems = showVisit
    ? BP_ITEMS
    : BP_ITEMS.filter(function(item) { return item.key !== 'systolic' && item.key !== 'diastolic'; });

  // 有効なデータがあるレコードのみ抽出
  const valid = readings.filter(function(r) {
    return activeItems.some(function(item) { return r[item.key] && r[item.key] > 0; });
  });
  if (valid.length === 0) {
    ctx.fillStyle = '#bdc3c7'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('データがありません', W / 2, H / 2);
    canvas._graphData = { items: BP_ITEMS, readings: [] };
    return;
  }

  valid.sort((a, b) => a.date.localeCompare(b.date));

  // Y軸範囲：60-150に固定
  const yMin = 60, yMax = 150;

  // 日付→X座標のマッピング（日数ベース）
  const firstDate = new Date(valid[0].date + 'T00:00:00');
  const lastDate = new Date(valid[valid.length - 1].date + 'T00:00:00');
  const totalDays = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
  const dayToX = (d) => pad.left + (d / totalDays) * pw;

  // ── グリッド（10刻み、1桁目5） ──
  for (let bp = 65; bp <= 145; bp += 10) {
    const y = bpToY(bp, pad, ph);
    const isTarget = (bp === 125 || bp === 75);
    ctx.strokeStyle = isTarget ? '#e74c3c' : '#e8ecef';
    ctx.lineWidth = isTarget ? 1.0 : 0.5;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = isTarget ? '#e74c3c' : '#95a5a6';
    ctx.font = isTarget ? 'bold 11px sans-serif' : '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(bp, pad.left - 5, y + 4);
  }

  // Y軸ラベル
  ctx.save();
  ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#7f8c8d'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('mmHg', 0, 0);
  ctx.restore();

  // ── 年区切り線（1月1日） ──
  ctx.strokeStyle = '#d5d8dc';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 4]);
  for (let y = firstDate.getFullYear() + 1; y <= lastDate.getFullYear(); y++) {
    const jan1 = new Date(y, 0, 1);
    if (jan1 >= firstDate && jan1 <= lastDate) {
      const dOff = Math.round((jan1 - firstDate) / 86400000);
      const x = dayToX(dOff);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, H - pad.bottom);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // ── 基準線（125/75, 135/85） ──
  const THRESHOLD_SETS = [
    { id: 'chk-threshold-12575', sbp: 125, dbp: 75, color: '#27ae60', label: '125/75' },
    { id: 'chk-threshold-13585', sbp: 135, dbp: 85, color: '#e67e22', label: '135/85' },
  ];
  THRESHOLD_SETS.forEach(function(ts) {
    const chk = document.getElementById(ts.id);
    if (!chk || !chk.checked) return;
    ctx.strokeStyle = ts.color;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.65;
    var ySbp = bpToY(ts.sbp, pad, ph);
    ctx.beginPath(); ctx.moveTo(pad.left, ySbp); ctx.lineTo(W - pad.right, ySbp); ctx.stroke();
    ctx.fillStyle = ts.color; ctx.globalAlpha = 0.85;
    ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(ts.sbp, W - pad.right - 4, ySbp + 3);
    var yDbp = bpToY(ts.dbp, pad, ph);
    ctx.beginPath(); ctx.moveTo(pad.left, yDbp); ctx.lineTo(W - pad.right, yDbp); ctx.stroke();
    ctx.fillText(ts.dbp, W - pad.right - 4, yDbp + 3);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  });

  // ── 折れ線を描画（表示対象のみ） ──
  const seriesData = []; // ツールチップ用に各ポイントを保持

  activeItems.forEach(function(item) {
    // この項目の値を持つポイントを収集
    const pts = [];
    valid.forEach(r => {
      const v = r[item.key];
      if (v && v > 0) {
        const dt = new Date(r.date + 'T00:00:00');
        const dOff = Math.round((dt - firstDate) / 86400000);
        pts.push({
          x: dayToX(dOff),
          y: bpToY(v, pad, ph),
          val: v,
          date: r.date,
          reading: r,
        });
      }
    });

    if (pts.length === 0) return;

    // 折れ線（値が続いている区間ごとに描画）
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.lineWidth || GRAPH.lineWidth;
    ctx.lineJoin = 'round';
    if (item.opacity != null) ctx.globalAlpha = item.opacity;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < pts.length; i++) {
      if (!started) {
        ctx.moveTo(pts[i].x, pts[i].y);
        started = true;
      } else {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
    }
    ctx.stroke();
    if (item.opacity != null) ctx.globalAlpha = 1.0;

    // ドット
    if (item.opacity != null) ctx.globalAlpha = item.opacity;
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, GRAPH.dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });
    if (item.opacity != null) ctx.globalAlpha = 1.0;

    seriesData.push({ key: item.key, label: item.label, color: item.color, pts: pts });
  });

  // ── X軸ラベル（年月日） ──
  ctx.fillStyle = '#95a5a6'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  const labelStep = Math.max(1, Math.floor(totalDays / 12));
  let lastMonth = '';
  valid.forEach(r => {
    const dt = new Date(r.date + 'T00:00:00');
    const dOff = Math.round((dt - firstDate) / 86400000);
    if (dOff % labelStep === 0 || dOff === 0 || dOff === totalDays) {
      const m = r.date.slice(0, 7);
      ctx.fillText(r.date.slice(5), dayToX(dOff), H - pad.bottom + 16);
      if (m !== lastMonth) {
        ctx.fillStyle = '#7f8c8d'; ctx.font = 'bold 11px sans-serif';
        ctx.fillText(m.slice(0, 4) + '/' + m.slice(5, 7), dayToX(dOff), H - pad.bottom + 30);
        ctx.fillStyle = '#95a5a6'; ctx.font = '10px sans-serif';
        lastMonth = m;
      }
    }
  });

  // ツールチップ用データ（表示対象のみ）
  canvas._graphData = { items: activeItems, readings: valid, seriesData, W, H, pad };
}

// ── メイン描画関数 ──
function drawGraph(canvas, readings) {
  drawAllPeriodGraph(canvas, readings);
}

// ── ツールチップ ──
function setupTooltip(canvas) {
  let tt = null;
  canvas.addEventListener('mousemove', (e) => {
    const g = canvas._graphData;
    if (!g || g.readings.length === 0) return;
    if (tt) { tt.remove(); tt = null; }

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    // マウスXに最も近い日付のレコードを探す
    const pad = g.pad;
    const pw = canvas.offsetWidth - pad.left - pad.right;
    const firstDate = new Date(g.readings[0].date + 'T00:00:00');
    const lastDate = new Date(g.readings[g.readings.length - 1].date + 'T00:00:00');
    const totalDays = Math.max(1, Math.round((lastDate - firstDate) / 86400000));

    // 最も近いレコードを探す（X座標ベース）
    let closest = null;
    let minDist = Infinity;
    g.readings.forEach(r => {
      const dt = new Date(r.date + 'T00:00:00');
      const dOff = Math.round((dt - firstDate) / 86400000);
      const x = pad.left + (dOff / totalDays) * pw;
      const d = Math.abs(mx - x);
      if (d < minDist) { minDist = d; closest = r; }
    });

    // 20px以上離れていたら非表示
    if (!closest || minDist > 20) return;

    // ツールチップ内容（そのレコードが持つ全項目を表示）
    var allItems = window.BP_ITEMS || BP_ITEMS;
    let html = `<strong>${closest.date}</strong>`;
    allItems.forEach(function(item) {
      const v = closest[item.key];
      if (v && v > 0) {
        html += `<br><span style="color:${item.color}">●</span> ${item.label}: ${v}`;
      }
    });

    const dt = new Date(closest.date + 'T00:00:00');
    const dOff = Math.round((dt - firstDate) / 86400000);
    const tx = pad.left + (dOff / totalDays) * pw;

    tt = document.createElement('div');
    tt.style.cssText =
      'position:absolute;background:rgba(44,62,80,.92);color:#fff;padding:8px 12px;' +
      'border-radius:5px;font-size:12px;pointer-events:none;white-space:nowrap;' +
      `left:${Math.min(tx + 14, canvas.parentElement.offsetWidth - 200)}px;` +
      `top:${Math.max(e.clientY - rect.top - 10, 10)}px;` +
      'z-index:50;box-shadow:0 2px 8px rgba(0,0,0,.3);line-height:1.6';
    tt.innerHTML = html;
    canvas.parentElement.appendChild(tt);
  });

  canvas.addEventListener('mouseleave', () => {
    if (tt) { tt.remove(); tt = null; }
  });
}
