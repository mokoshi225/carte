/* =================================================================
   chart.js — Canvas 2D グラフ描画モジュール v1.1.0
   8項目（受診SBP/DBP, 家庭平均/最小/最大SBP/DBP）の時系列折れ線
   ================================================================= */

const BP_ITEMS = [
  { key: 'systolic',  label: '受診SBP', color: '#c0392b' },
  { key: 'avgSbp',    label: '家庭SBP平均', color: '#e67e22' },
  { key: 'minSbp',    label: '家庭SBP最小', color: '#f39c12' },
  { key: 'maxSbp',    label: '家庭SBP最大', color: '#e74c3c' },
  { key: 'diastolic', label: '受診DBP', color: '#2980b9' },
  { key: 'avgDbp',    label: '家庭DBP平均', color: '#27ae60' },
  { key: 'minDbp',    label: '家庭DBP最小', color: '#1abc9c' },
  { key: 'maxDbp',    label: '家庭DBP最大', color: '#8e44ad' },
];

const GRAPH = {
  padding: { top: 30, right: 20, bottom: 45, left: 50 },
  dotRadius: 3.5,
  lineWidth: 1.8,
};

function bpToY(bp, pad, plotH) {
  return pad.top + plotH - ((bp - 50) / (210 - 50)) * plotH;
}

/**
 * 全期間ビュー：8項目の折れ線グラフを描画
 * 警戒線・平均線・レンジ表示は一切なし
 */
function drawAllPeriodGraph(canvas, readings) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width, H = 380;
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

  // Y軸範囲：表示対象の全項目の値から自動計算
  let allVals = [];
  valid.forEach(function(r) {
    activeItems.forEach(function(item) {
      const v = r[item.key];
      if (v && v > 0) allVals.push(v);
    });
  });
  let yMin = Math.min(...allVals);
  let yMax = Math.max(...allVals);
  yMin = Math.max(50, Math.floor(yMin / 10) * 10 - 10);
  yMax = Math.min(210, Math.ceil(yMax / 10) * 10 + 10);

  // 日付→X座標のマッピング（日数ベース）
  const firstDate = new Date(valid[0].date + 'T00:00:00');
  const lastDate = new Date(valid[valid.length - 1].date + 'T00:00:00');
  const totalDays = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
  const dayToX = (d) => pad.left + (d / totalDays) * pw;

  // ── グリッド ──
  ctx.strokeStyle = '#e8ecef'; ctx.lineWidth = 0.5;
  for (let bp = yMin; bp <= yMax; bp += 20) {
    const y = bpToY(bp, pad, ph);
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = '#95a5a6'; ctx.font = '11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(bp, pad.left - 5, y + 4);
  }

  // Y軸ラベル
  ctx.save();
  ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#7f8c8d'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('mmHg', 0, 0);
  ctx.restore();

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
    ctx.lineWidth = GRAPH.lineWidth;
    ctx.lineJoin = 'round';
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

    // ドット
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, GRAPH.dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

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
