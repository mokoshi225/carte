/* =================================================================
   chart.js — Canvas 2D グラフ描画モジュール v3.5.0
   血圧8項目 + 体重サブグラフ（自動スケール）+ 浮腫マーカー
   ================================================================= */

BPApp.Chart = (function () {

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
    padding: { top: 30, right: 20, bottom: 8, left: 50 },
    dotRadius: 3.5,
    lineWidth: 1.8,
    // サブグラフ高さ
    bpPlotH: 340,
    pulseH: 100,
    weightH: 110,
    edemaH: 50,
  };

  /* ── Y座標変換 ── */

  function bpToY(bp, pad, plotH) {
    return pad.top + plotH - ((bp - 60) / (150 - 60)) * plotH;
  }

  function weightToY(weight, wtPlotH, wMin, wMax) {
    var range = Math.max(wMax - wMin, 0.1);
    return (1 - (weight - wMin) / range) * wtPlotH;
  }

  function edemaToY(edema, edPlotH) {
    return (1 - edema / 4) * edPlotH;
  }

  /* ── 薬剤バー描画（Yオフセット対応版） ── */

  function drawMedicationBars(ctx, medications, firstDate, lastDate, pad, pw, W, H, barTopY) {
    const medList = medications || [];
    if (medList.length === 0) return;

    const totalDays = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
    const dayToX = (d) => pad.left + (d / totalDays) * pw;

    const MED_COLORS = ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

    function nameColor(name) {
      var hash = 0;
      for (var i = 0; i < name.length; i++) hash += name.charCodeAt(i);
      return MED_COLORS[hash % MED_COLORS.length];
    }

    var barH = 16;

    medList.forEach(function(m, idx) {
      var startDt = new Date(m.startDate + 'T00:00:00');
      var endDt = m.endDate ? new Date(m.endDate + 'T00:00:00') : lastDate;

      var dOffStart = Math.max(0, Math.round((startDt - firstDate) / 86400000));
      var dOffEnd = Math.min(totalDays, Math.round((endDt - firstDate) / 86400000));

      var barX = dayToX(dOffStart);
      var barW = dayToX(dOffEnd) - barX;
      var barY = barTopY + idx * 20;

      if (barW < 1) return;

      var color = nameColor(m.drugName);

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.65;
      var r = Math.min(3, barH / 2);
      ctx.beginPath();
      ctx.moveTo(barX + r, barY);
      ctx.lineTo(barX + barW - r, barY);
      ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + r);
      ctx.lineTo(barX + barW, barY + barH - r);
      ctx.quadraticCurveTo(barX + barW, barY + barH, barX + barW - r, barY + barH);
      ctx.lineTo(barX + r, barY + barH);
      ctx.quadraticCurveTo(barX, barY + barH, barX, barY + barH - r);
      ctx.lineTo(barX, barY + r);
      ctx.quadraticCurveTo(barX, barY, barX + r, barY);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1.0;

      ctx.beginPath();
      ctx.arc(barX, barY + barH / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      var label = m.drugName + ' ' + m.dosage + m.dosageUnit + ' ' + m.timing;
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      var maxLabelW = barW - 8;
      if (maxLabelW > 14) {
        while (ctx.measureText(label + '…').width > maxLabelW && label.length > 1) {
          label = label.slice(0, -1);
        }
        if (ctx.measureText(label + '…').width <= maxLabelW && label.length < (m.drugName + ' ' + m.dosage + m.dosageUnit + ' ' + m.timing).length) {
          label += '…';
        }
        ctx.fillText(label, barX + 4, barY + barH / 2 + 1);
      }

      if (!m.endDate) {
        ctx.fillStyle = color;
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('▶', barX + barW + 2, barY + barH / 2 + 1);
      }
    });
  }

  /* ── 体重サブグラフ ── */

  function drawWeightSubGraph(ctx, readings, firstDate, lastDate, totalDays, dayToX, pw, left, yOff, h) {
    var valid = readings.filter(function(r) { return r.weight && r.weight > 0; });
    if (valid.length === 0) return null;

    var wMin = Infinity, wMax = -Infinity;
    valid.forEach(function(r) {
      if (r.weight < wMin) wMin = r.weight;
      if (r.weight > wMax) wMax = r.weight;
    });
    if (wMin === Infinity) return null;

    // マージン ±10%
    var margin = (wMax - wMin) * 0.1 || 5;
    wMin = Math.max(0, wMin - margin);
    wMax = wMax + margin;

    var wtPlotH = h - 4; // internal padding 2px top, 2px bottom
    var wtLeft = left;
    var wtRight = 40; // right axis width

    // セクション背景
    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(wtLeft, yOff, pw + wtRight, h);

    // 領域仕切り線
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(wtLeft, yOff);
    ctx.lineTo(wtLeft + pw + wtRight, yOff);
    ctx.stroke();

    // グリッド（5本程度）
    var wStep = Math.ceil((wMax - wMin) / 4 / 5) * 5 || 5;
    if (wStep <= 0) wStep = 5;
    for (var w = Math.ceil(wMin / wStep) * wStep; w <= wMax; w += wStep) {
      var wy = yOff + 2 + weightToY(w, wtPlotH, wMin, wMax);
      ctx.strokeStyle = '#e8ecef';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(wtLeft + 2, wy); ctx.lineTo(wtLeft + pw + wtRight - 2, wy); ctx.stroke();

      ctx.fillStyle = '#95a5a6';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(w), wtLeft + pw + wtRight - 4, wy + 3);
    }

    // ラベル「体重」
    ctx.save();
    ctx.translate(wtLeft + pw + wtRight - 2, yOff + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('kg', 0, 0);
    ctx.restore();

    // 折れ線
    var pts = valid.map(function(r) {
      var dt = new Date(r.date + 'T00:00:00');
      var dOff = Math.round((dt - firstDate) / 86400000);
      return {
        x: dayToX(dOff),
        y: yOff + 2 + weightToY(r.weight, wtPlotH, wMin, wMax),
        weight: r.weight,
        date: r.date,
        reading: r
      };
    }).sort(function(a,b) { return a.x - b.x; });

    var color = '#8e44ad';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.0;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
      else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // ドット
    pts.forEach(function(p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    return { wMin: wMin, wMax: wMax, pts: pts };
  }

  /* ── 浮腫マーカー ── */

  function drawEdemaMarkers(ctx, readings, firstDate, lastDate, totalDays, dayToX, pw, left, yOff, h) {
    var valid = readings.filter(function(r) { return r.edema >= 0; });
    if (valid.length === 0) return null;

    var edPlotH = h - 4;
    var edLeft = left;

    // セクション背景
    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(edLeft, yOff, pw + 20, h);

    // 領域仕切り線
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(edLeft, yOff);
    ctx.lineTo(edLeft + pw + 20, yOff);
    ctx.stroke();

    // Y軸ラベル（0, 2, 4）
    [0, 2, 4].forEach(function(v) {
      var ey = yOff + 2 + edemaToY(v, edPlotH);
      ctx.fillStyle = '#95a5a6';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(v, edLeft - 4, ey + 3);
    });

    // ラベル「浮腫」
    ctx.save();
    ctx.translate(edLeft - 2, yOff + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('浮腫', 0, 0);
    ctx.restore();

    // 0-4 のベースライン
    for (var level = 0; level <= 4; level++) {
      var ly = yOff + 2 + edemaToY(level, edPlotH);
      ctx.strokeStyle = (level === 0) ? '#e8ecef' : '#eee';
      ctx.lineWidth = 0.5;
      ctx.setLineDash(level === 0 ? [] : [2, 3]);
      ctx.beginPath(); ctx.moveTo(edLeft + 2, ly); ctx.lineTo(edLeft + pw, ly); ctx.stroke();
      ctx.setLineDash([]);
    }

    var EDEMA_COLORS = {0:'#27ae60', 1:'#f1c40f', 2:'#e67e22', 3:'#e74c3c', 4:'#c0392b'};

    var pts = [];
    valid.forEach(function(r) {
      if (r.edema < 0 || r.edema > 4) return;
      var dt = new Date(r.date + 'T00:00:00');
      var dOff = Math.round((dt - firstDate) / 86400000);
      var ex = dayToX(dOff);
      var ey = yOff + 2 + edemaToY(r.edema, edPlotH);
      pts.push({ x: ex, y: ey, edema: r.edema, date: r.date, reading: r });

      var color = EDEMA_COLORS[r.edema] || '#95a5a6';
      var radius = 4 + r.edema * 1.5;

      // マーカー（大きさと色で重症度表現）
      ctx.beginPath();
      ctx.arc(ex, ey, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 重症度ラベル
      ctx.fillStyle = '#fff';
      ctx.font = '7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.edema, ex, ey);
    });

    return { pts: pts };
  }

  /* ── 脈拍サブグラフ ── */

  function drawPulseSubGraph(ctx, readings, firstDate, lastDate, totalDays, dayToX, pw, left, yOff, h) {
    var validMin = readings.filter(function(r) { return r.minPulse && r.minPulse > 0; });
    var validMax = readings.filter(function(r) { return r.maxPulse && r.maxPulse > 0; });
    if (validMin.length === 0 && validMax.length === 0) return null;

    // 全脈拍値の最小・最大を求める（自動スケール）
    var pMin = Infinity, pMax = -Infinity;
    validMin.forEach(function(r) { if (r.minPulse < pMin) pMin = r.minPulse; if (r.minPulse > pMax) pMax = r.minPulse; });
    validMax.forEach(function(r) { if (r.maxPulse < pMin) pMin = r.maxPulse; if (r.maxPulse > pMax) pMax = r.maxPulse; });
    if (pMin === Infinity) return null;

    // マージン ±10%
    var margin = Math.max((pMax - pMin) * 0.1, 5);
    pMin = Math.max(0, Math.floor(pMin - margin));
    pMax = Math.ceil(pMax + margin);

    var pulsePlotH = h - 4;

    // セクション背景
    ctx.fillStyle = '#f8f9fb';
    ctx.fillRect(left, yOff, pw + 40, h);

    // 領域仕切り線
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(left, yOff);
    ctx.lineTo(left + pw + 40, yOff);
    ctx.stroke();

    // グリッド（5本程度）
    var step = Math.max(1, Math.ceil((pMax - pMin) / 4 / 5) * 5 || 5);
    for (var v = Math.ceil(pMin / step) * step; v <= pMax; v += step) {
      var py = yOff + 2 + ((pMax - v) / (pMax - pMin)) * pulsePlotH;
      ctx.strokeStyle = '#e8ecef';
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(left + 2, py); ctx.lineTo(left + pw + 36, py); ctx.stroke();

      ctx.fillStyle = '#95a5a6';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(v), left + pw + 36, py + 3);
    }

    // ラベル「脈拍」
    ctx.save();
    ctx.translate(left + pw + 38, yOff + h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#7f8c8d';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('/min', 0, 0);
    ctx.restore();

    function pulseToY(v) {
      return yOff + 2 + ((pMax - v) / (pMax - pMin)) * pulsePlotH;
    }

    function buildPts(items, key) {
      return items.map(function(r) {
        var dt = new Date(r.date + 'T00:00:00');
        var dOff = Math.round((dt - firstDate) / 86400000);
        return {
          x: dayToX(dOff),
          y: pulseToY(r[key]),
          val: r[key],
          date: r.date,
          reading: r
        };
      }).sort(function(a,b) { return a.x - b.x; });
    }

    // minPulse（薄めの線）
    var ptsMin = buildPts(validMin, 'minPulse');
    if (ptsMin.length > 0) {
      var colorMin = '#3498db';
      ctx.strokeStyle = colorMin;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < ptsMin.length; i++) {
        if (i === 0) ctx.moveTo(ptsMin[i].x, ptsMin[i].y);
        else ctx.lineTo(ptsMin[i].x, ptsMin[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      ptsMin.forEach(function(p) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = colorMin; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      });
    }

    // maxPulse（やや太め）
    var ptsMax = buildPts(validMax, 'maxPulse');
    if (ptsMax.length > 0) {
      var colorMax = '#e74c3c';
      ctx.strokeStyle = colorMax;
      ctx.lineWidth = 2.0;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < ptsMax.length; i++) {
        if (i === 0) ctx.moveTo(ptsMax[i].x, ptsMax[i].y);
        else ctx.lineTo(ptsMax[i].x, ptsMax[i].y);
      }
      ctx.stroke();

      ptsMax.forEach(function(p) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colorMax; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      });
    }

    return { pMin: pMin, pMax: pMax, ptsMin: ptsMin, ptsMax: ptsMax };
  }

  /* ── メイン描画 ── */

  function drawAllPeriodGraph(canvas, readings, medications) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const W = rect.width;

    // トグル状態
    const showVisit = !document.getElementById('chk-show-visit') || document.getElementById('chk-show-visit').checked;
    const showWeight = !document.getElementById('chk-show-weight') || document.getElementById('chk-show-weight').checked;
    const showEdema = !document.getElementById('chk-show-edema') || document.getElementById('chk-show-edema').checked;
    const showPulse = !document.getElementById('chk-show-pulse') || document.getElementById('chk-show-pulse').checked;

    // 表示するBPアイテム
    const activeItems = showVisit
      ? BP_ITEMS
      : BP_ITEMS.filter(function(item) { return item.key !== 'systolic' && item.key !== 'diastolic'; });

    // 有効レコード
    const valid = readings.filter(function(r) {
      return activeItems.some(function(item) { return r[item.key] && r[item.key] > 0; })
        || (showWeight && r.weight > 0)
        || (showEdema && r.edema >= 0)
        || (showPulse && ((r.minPulse && r.minPulse > 0) || (r.maxPulse && r.maxPulse > 0)));
    });

    // 日付範囲
    const medList = medications || [];
    let firstDate, lastDate;
    if (valid.length > 0) {
      valid.sort((a, b) => a.date.localeCompare(b.date));
      firstDate = new Date(valid[0].date + 'T00:00:00');
      lastDate = new Date(valid[valid.length - 1].date + 'T00:00:00');
    } else if (medList.length > 0) {
      var allDates = [];
      medList.forEach(function(m) {
        if (m.startDate) allDates.push(m.startDate);
        if (m.endDate) allDates.push(m.endDate);
      });
      if (allDates.length > 0) {
        allDates.sort();
        firstDate = new Date(allDates[0] + 'T00:00:00');
        lastDate = new Date(allDates[allDates.length - 1] + 'T00:00:00');
        var tmpEnd = new Date(lastDate);
        tmpEnd.setMonth(tmpEnd.getMonth() + 1);
        lastDate = tmpEnd;
        var tmpStart = new Date(firstDate);
        tmpStart.setMonth(tmpStart.getMonth() - 1);
        firstDate = tmpStart;
      }
    }

    const pad = GRAPH.padding;
    const PLOT_LEFT = pad.left;
    const PLOT_RIGHT = pad.right;

    // レイアウト計算
    const bpPlotH = showWeight || showEdema || showPulse ? GRAPH.bpPlotH : 380;
    const pulseH = showPulse ? GRAPH.pulseH : 0;
    const weightH = showWeight ? GRAPH.weightH : 0;
    const edemaH = showEdema ? GRAPH.edemaH : 0;
    const medBarH = medList.length > 0 ? medList.length * 20 + 25 : 0;
    const gap = 4;

    var bpSectionBottom = pad.top + bpPlotH;
    var pulseSectionTop = bpSectionBottom + gap;
    var pulseSectionBottom = pulseSectionTop + pulseH;
    var weightSectionTop = pulseSectionBottom + (showPulse ? gap : 0);
    var weightSectionBottom = weightSectionTop + weightH;
    var edemaSectionTop = weightSectionBottom + (showWeight ? gap : 0);
    var edemaSectionBottom = edemaSectionTop + edemaH;
    var medBarTop = edemaSectionBottom + (showEdema ? gap : 0);

    const H = medBarTop + medBarH;

    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px'; canvas.style.width = '100%';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!firstDate || !lastDate) {
      ctx.fillStyle = '#bdc3c7'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('データがありません', W / 2, H / 2);
      canvas._graphData = { items: BP_ITEMS, readings: [], medications: medList };
      return;
    }

    const yMin = 60, yMax = 150;
    const totalDays = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
    const pw = W - PLOT_LEFT - PLOT_RIGHT;
    const dayToX = (d) => PLOT_LEFT + (d / totalDays) * pw;

    // ─── BP セクション ───

    // グリッド
    for (let bp = 65; bp <= 145; bp += 10) {
      const y = bpToY(bp, pad, bpPlotH);
      const isTarget = (bp === 125 || bp === 75);
      ctx.strokeStyle = isTarget ? '#e74c3c' : '#e8ecef';
      ctx.lineWidth = isTarget ? 1.0 : 0.5;
      ctx.beginPath(); ctx.moveTo(PLOT_LEFT, y); ctx.lineTo(W - PLOT_RIGHT, y); ctx.stroke();
      ctx.fillStyle = isTarget ? '#e74c3c' : '#95a5a6';
      ctx.font = isTarget ? 'bold 11px sans-serif' : '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(bp, PLOT_LEFT - 5, y + 4);
    }

    // Y軸ラベル
    ctx.save();
    ctx.translate(14, pad.top + bpPlotH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#7f8c8d'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('mmHg', 0, 0);
    ctx.restore();

    // 年区切り線（全セクション共通）
    ctx.strokeStyle = '#d5d8dc';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 4]);
    var allSectionBottom = medBarTop > 0 ? medBarTop : (showPulse ? pulseSectionBottom : (showWeight ? weightSectionBottom : (showEdema ? edemaSectionBottom : bpSectionBottom)));
    for (let y = firstDate.getFullYear() + 1; y <= lastDate.getFullYear(); y++) {
      const jan1 = new Date(y, 0, 1);
      if (jan1 >= firstDate && jan1 <= lastDate) {
        const dOff = Math.round((jan1 - firstDate) / 86400000);
        const x = dayToX(dOff);
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, allSectionBottom);
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 基準線
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
      var ySbp = bpToY(ts.sbp, pad, bpPlotH);
      ctx.beginPath(); ctx.moveTo(PLOT_LEFT, ySbp); ctx.lineTo(W - PLOT_RIGHT, ySbp); ctx.stroke();
      ctx.fillStyle = ts.color; ctx.globalAlpha = 0.85;
      ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(ts.sbp, W - PLOT_RIGHT - 4, ySbp + 3);
      var yDbp = bpToY(ts.dbp, pad, bpPlotH);
      ctx.beginPath(); ctx.moveTo(PLOT_LEFT, yDbp); ctx.lineTo(W - PLOT_RIGHT, yDbp); ctx.stroke();
      ctx.fillText(ts.dbp, W - PLOT_RIGHT - 4, yDbp + 3);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    });

    // BP折れ線
    const seriesData = [];
    activeItems.forEach(function(item) {
      const pts = [];
      valid.forEach(r => {
        const v = r[item.key];
        if (v && v > 0) {
          const dt = new Date(r.date + 'T00:00:00');
          const dOff = Math.round((dt - firstDate) / 86400000);
          pts.push({
            x: dayToX(dOff),
            y: bpToY(v, pad, bpPlotH),
            val: v,
            date: r.date,
            reading: r,
          });
        }
      });
      if (pts.length === 0) return;

      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.lineWidth || GRAPH.lineWidth;
      ctx.lineJoin = 'round';
      if (item.opacity != null) ctx.globalAlpha = item.opacity;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < pts.length; i++) {
        if (!started) { ctx.moveTo(pts[i].x, pts[i].y); started = true; }
        else { ctx.lineTo(pts[i].x, pts[i].y); }
      }
      ctx.stroke();
      if (item.opacity != null) ctx.globalAlpha = 1.0;

      if (item.opacity != null) ctx.globalAlpha = item.opacity;
      pts.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, GRAPH.dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = item.color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
      });
      if (item.opacity != null) ctx.globalAlpha = 1.0;

      seriesData.push({ key: item.key, label: item.label, color: item.color, pts: pts });
    });

    // ─── 脈拍サブグラフ ───
    var pulseData = null;
    if (showPulse) {
      pulseData = drawPulseSubGraph(ctx, valid, firstDate, lastDate, totalDays, dayToX, pw, PLOT_LEFT, pulseSectionTop, pulseH);
    }

    // ─── 体重サブグラフ ───
    var weightData = null;
    if (showWeight) {
      weightData = drawWeightSubGraph(ctx, valid, firstDate, lastDate, totalDays, dayToX, pw, PLOT_LEFT, weightSectionTop, weightH);
    }

    // ─── 浮腫マーカー ───
    var edemaData = null;
    if (showEdema) {
      edemaData = drawEdemaMarkers(ctx, valid, firstDate, lastDate, totalDays, dayToX, pw, PLOT_LEFT, edemaSectionTop, edemaH);
    }

    // ─── X軸ラベル（最下部の可視セクション直下） ───
    var xLabelY;
    if (showEdema) {
      xLabelY = edemaSectionBottom + 12;
    } else if (showWeight) {
      xLabelY = weightSectionBottom + 12;
    } else if (showPulse) {
      xLabelY = pulseSectionBottom + 12;
    } else {
      xLabelY = bpSectionBottom + 12;
    }

    ctx.fillStyle = '#95a5a6'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor(totalDays / 12));
    let lastMonth = '';
    valid.forEach(r => {
      const dt = new Date(r.date + 'T00:00:00');
      const dOff = Math.round((dt - firstDate) / 86400000);
      if (dOff % labelStep === 0 || dOff === 0 || dOff === totalDays) {
        ctx.fillText(r.date.slice(5), dayToX(dOff), xLabelY);
        const m = r.date.slice(0, 7);
        if (m !== lastMonth) {
          ctx.fillStyle = '#7f8c8d'; ctx.font = 'bold 11px sans-serif';
          ctx.fillText(m.slice(0, 4) + '/' + m.slice(5, 7), dayToX(dOff), xLabelY + 14);
          ctx.fillStyle = '#95a5a6'; ctx.font = '10px sans-serif';
          lastMonth = m;
        }
      }
    });

    // ─── 薬剤バー ───
    drawMedicationBars(ctx, medList, firstDate, lastDate, pad, pw, W, H, medBarTop);

    // ツールチップ用データ
    canvas._graphData = {
      items: activeItems,
      readings: valid,
      seriesData: seriesData,
      W: W, H: H,
      pad: pad,
      medications: medList,
      weightData: weightData,
      edemaData: edemaData,
      pulseData: pulseData,
      showWeight: showWeight,
      showEdema: showEdema,
      showPulse: showPulse
    };
  }

  /* ── 描画エントリ ── */

  function drawGraph(canvas, readings, medications) {
    drawAllPeriodGraph(canvas, readings, medications);
  }

  /* ── ツールチップ ── */

  function setupTooltip(canvas) {
    let tt = null;
    canvas.addEventListener('mousemove', (e) => {
      const g = canvas._graphData;
      if (!g || g.readings.length === 0) return;
      if (tt) { tt.remove(); tt = null; }

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;

      const pad = g.pad;
      const allReadings = g.readings;
      const firstDate = new Date(allReadings[0].date + 'T00:00:00');
      const lastDate = new Date(allReadings[allReadings.length - 1].date + 'T00:00:00');
      const totalDays = Math.max(1, Math.round((lastDate - firstDate) / 86400000));
      const pw = canvas.offsetWidth - pad.left - pad.right;

      let closest = null;
      let minDist = Infinity;
      allReadings.forEach(r => {
        const dt = new Date(r.date + 'T00:00:00');
        const dOff = Math.round((dt - firstDate) / 86400000);
        const x = pad.left + (dOff / totalDays) * pw;
        const d = Math.abs(mx - x);
        if (d < minDist) { minDist = d; closest = r; }
      });

      if (!closest || minDist > 20) return;

      var allItems = window.BP_ITEMS || BP_ITEMS;
      let html = '<strong>' + closest.date + '</strong>';
      allItems.forEach(function(item) {
        const v = closest[item.key];
        if (v && v > 0) {
          html += '<br><span style="color:' + item.color + '">●</span> ' + item.label + ': ' + v;
        }
      });
      if (g.showWeight && closest.weight > 0) {
        html += '<br><span style="color:#8e44ad">●</span> 体重: ' + closest.weight + 'kg';
      }
      if (g.showEdema && closest.edema >= 0) {
        var edemaLabels = {0:'なし',1:'軽度(1+)',2:'中等度(2+)',3:'高度(3+)',4:'著明(4+)'};
        var label = edemaLabels[closest.edema] || closest.edema;
        html += '<br><span style="color:#e84393">●</span> 浮腫: ' + label;
      }
      if (g.showPulse) {
        if (closest.minPulse && closest.minPulse > 0) {
          html += '<br><span style="color:#3498db">●</span> 脈拍最小: ' + closest.minPulse;
        }
        if (closest.maxPulse && closest.maxPulse > 0) {
          html += '<br><span style="color:#e74c3c">●</span> 脈拍最大: ' + closest.maxPulse;
        }
      }

      const dt = new Date(closest.date + 'T00:00:00');
      const dOff = Math.round((dt - firstDate) / 86400000);
      const tx = pad.left + (dOff / totalDays) * pw;

      tt = document.createElement('div');
      tt.style.cssText =
        'position:absolute;background:rgba(44,62,80,.92);color:#fff;padding:8px 12px;' +
        'border-radius:5px;font-size:12px;pointer-events:none;white-space:nowrap;' +
        'left:' + Math.min(tx + 14, canvas.parentElement.offsetWidth - 200) + 'px;' +
        'top:' + Math.max(e.clientY - rect.top - 10, 10) + 'px;' +
        'z-index:50;box-shadow:0 2px 8px rgba(0,0,0,.3);line-height:1.6';
      tt.innerHTML = html;
      canvas.parentElement.appendChild(tt);
    });

    canvas.addEventListener('mouseleave', () => {
      if (tt) { tt.remove(); tt = null; }
    });
  }

  /* ---- グローバル公開（後方互換性） ---- */

  window.BP_ITEMS = BP_ITEMS;
  window.GRAPH = GRAPH;
  window.drawAllPeriodGraph = drawAllPeriodGraph;
  window.drawGraph = drawGraph;
  window.setupTooltip = setupTooltip;

  /* ---- 公開API ---- */

  return {
    BP_ITEMS: BP_ITEMS,
    GRAPH: GRAPH,
    drawGraph: drawGraph,
    drawAllPeriodGraph: drawAllPeriodGraph,
    drawMedicationBars: drawMedicationBars,
    setupTooltip: setupTooltip
  };

})();
