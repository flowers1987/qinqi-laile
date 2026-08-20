/* ============================================================
   亲戚来了 · 应用逻辑
   存储 / 预测 / 日历 / 记录 / 设置 / 导出
   ============================================================ */
(function () {
  "use strict";

  const STORE_KEY = "qinqi_state_v1";

  const THEMES = {
    rose:   { accent: "#d8485a", soft: "rgba(216,72,90,0.22)",  ink: "#f5c8cf" }, // 郁金香红（默认）
    ember:  { accent: "#e08344", soft: "rgba(224,131,68,0.22)",  ink: "#f5d2b0" }, // 暖橙
    plum:   { accent: "#a86a95", soft: "rgba(168,106,149,0.22)", ink: "#e0c2d4" }, // 暗紫
    moss:   { accent: "#869760", soft: "rgba(134,151,96,0.22)",  ink: "#cfd6b4" }, // 暮苔
    gold:   { accent: "#c9a85a", soft: "rgba(201,168,90,0.22)",  ink: "#ecdaa8" }, // 暮金
  };

  /* ---------------- 状态 ---------------- */
  let state = load();
  let viewYear, viewMonth; // 当前日历展示的年月
  let editingId = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        s.records = (s.records || []).sort((a, b) => a.start.localeCompare(b.start));
        s.settings = Object.assign(
          { cycle: 28, periodLen: 5, theme: "rose", weekStart: 1 },
          s.settings || {}
        );
        return s;
      }
    } catch (e) {}
    return { records: [], settings: { cycle: 28, periodLen: 5, theme: "rose", weekStart: 1 } };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------------- 日期工具 ---------------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseYMD(s) { const p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function diffDays(a, b) { return Math.round((b - a) / 86400000); }
  function today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }
  function fmtMD(d) { return (d.getMonth() + 1) + "月" + d.getDate() + "日"; }
  function fmtMDshort(d) { return (d.getMonth() + 1) + "/" + d.getDate(); }

  /* ---------------- 经期数据集合 ---------------- */
  function recordedSet() {
    const set = new Set();
    state.records.forEach((r) => {
      const s = parseYMD(r.start);
      for (let i = 0; i < r.duration; i++) set.add(ymd(addDays(s, i)));
    });
    return set;
  }

  function predictedSet(viewStart, viewEnd) {
    const set = new Set();
    if (!state.records.length) return set;
    const cycle = +state.settings.cycle;
    const dur = +state.settings.periodLen;
    const t = today();
    let cur = parseYMD(state.records[state.records.length - 1].start);
    let guard = 0;
    while (guard++ < 60) {
      cur = addDays(cur, cycle);
      if (cur > viewEnd) break;
      for (let i = 0; i < dur; i++) {
        const d = addDays(cur, i);
        if (d >= t && d >= viewStart) set.add(ymd(d));
      }
    }
    return set;
  }

  /* ---------------- 预测摘要 ---------------- */
  function predictSummary() {
    const t = today();
    if (!state.records.length) {
      return { label: "距离下次经期", value: "—", sub: "尚未记录经期，点击下方开始" };
    }
    const last = state.records[state.records.length - 1];
    const lastStart = parseYMD(last.start);
    const lastEnd = addDays(lastStart, last.duration - 1);
    const cycle = +state.settings.cycle;

    // 当前是否处于经期中
    if (t >= lastStart && t <= lastEnd) {
      const dayNo = diffDays(lastStart, t) + 1;
      return {
        label: "经期进行中",
        value: "第 " + dayNo + " 天",
        sub: "预计 " + fmtMD(lastEnd) + " 结束",
      };
    }
    const next = addDays(lastStart, cycle);
    const days = diffDays(t, next);
    if (days > 0) {
      return { label: "距离下次经期", value: "还有 " + days + " 天", sub: "预计 " + fmtMD(next) + " 来潮" };
    }
    return { label: "已超过预计", value: Math.abs(days) + " 天", sub: "预计 " + fmtMD(next) + " 来潮（已逾期）" };
  }

  /* ---------------- 渲染：看板 ---------------- */
  function renderDashboard() {
    const t = today();
    // 问候（固定品牌文案）
    document.getElementById("greet-text").textContent = "肖战守护我";
    document.getElementById("today-label").textContent = fmtMD(t) + " · 星期" + "日一二三四五六"[t.getDay()];

    renderCalendar();
  }

  /* ---------------- 渲染：日历 ---------------- */
  function renderCalendar() {
    const t = today();
    const first = new Date(viewYear, viewMonth, 1, 12);
    const title = viewYear + "年" + (viewMonth + 1) + "月";
    document.getElementById("cal-title").textContent = title;

    const wk = +state.settings.weekStart;
    const heads = ["日", "一", "二", "三", "四", "五", "六"];
    const order = [];
    for (let i = 0; i < 7; i++) order.push(heads[(wk + i) % 7]);
    document.getElementById("cal-week").innerHTML = order.map((d) => "<span>" + d + "</span>").join("");

    const grid = document.getElementById("cal-grid");
    grid.innerHTML = "";
    const startOffset = (first.getDay() - wk + 7) % 7;
    const startDate = addDays(first, -startOffset);
    const viewStart = new Date(viewYear, viewMonth, 1, 12);
    const viewEnd = new Date(viewYear, viewMonth + 1, 0, 12);
    const rec = recordedSet();
    const pred = predictedSet(viewStart, viewEnd);

    for (let i = 0; i < 42; i++) {
      const d = addDays(startDate, i);
      const cell = document.createElement("div");
      cell.className = "cal-cell";
      const inMonth = d.getMonth() === viewMonth;
      if (!inMonth) cell.classList.add("muted");
      const dow = d.getDay();
      if (dow === 0 || dow === 6) cell.classList.add("weekend");
      const key = ymd(d);
      const isToday = key === ymd(t);
      if (rec.has(key)) cell.classList.add("period");
      else if (pred.has(key)) cell.classList.add("predict");
      if (isToday) cell.classList.add("today");

      const num = document.createElement("span");
      num.className = "day-num";
      num.textContent = d.getDate();
      cell.appendChild(num);
      cell.style.setProperty("--d", (i * 8) + "ms");
      grid.appendChild(cell);
    }
  }

  /* ---------------- 渲染：记录列表 ---------------- */
  function renderRecords() {
    const list = document.getElementById("record-list");
    const count = document.getElementById("record-count");
    count.textContent = state.records.length + " 条";
    if (!state.records.length) {
      list.innerHTML = '<div class="empty">还没有记录，去添加第一次吧 🌿</div>';
      return;
    }
    const sorted = state.records.slice().sort((a, b) => b.start.localeCompare(a.start));
    list.innerHTML = "";
    sorted.forEach((r, idx) => {
      const s = parseYMD(r.start);
      const e = addDays(s, r.duration - 1);
      const prev = idx < sorted.length - 1 ? parseYMD(sorted[idx + 1].start) : null;
      const gap = prev ? diffDays(prev, s) : null;
      const item = document.createElement("div");
      item.className = "record-item";
      item.style.animationDelay = (idx * 42) + "ms";
      item.innerHTML =
        '<div class="rec-badge">' + s.getDate() + "</div>" +
        '<div class="rec-main">' +
          '<div class="rec-date">' + s.getFullYear() + "年" + fmtMD(s) + "</div>" +
          '<div class="rec-meta">持续 ' + r.duration + " 天 · 至 " + fmtMD(e) +
          (gap !== null ? " · 距上次 " + gap + " 天" : "") + "</div>" +
        "</div>" +
        '<div class="rec-ops">' +
          '<button class="icon-btn" data-edit="' + r.id + '" aria-label="编辑">' +
            '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 20h9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>" +
          '<button class="icon-btn" data-del="' + r.id + '" aria-label="删除">' +
            '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>" +
        "</div>";
      list.appendChild(item);
    });
  }

  /* ---------------- 记录表单 ---------------- */
  function resetForm() {
    editingId = null;
    document.getElementById("form-title").textContent = "新增记录";
    document.getElementById("form-submit").textContent = "保存记录";
    document.getElementById("form-cancel").style.display = "none";
    document.getElementById("in-start").value = ymd(today());
    document.getElementById("in-duration").value = state.settings.periodLen;
  }

  function submitForm() {
    const start = document.getElementById("in-start").value;
    let dur = parseInt(document.getElementById("in-duration").value, 10);
    if (!start) { toast("请选择开始日期"); return; }
    if (isNaN(dur) || dur < 1) dur = 1;
    if (dur > 15) dur = 15;

    if (editingId) {
      const r = state.records.find((x) => x.id === editingId);
      if (r) { r.start = start; r.duration = dur; }
      toast("已更新记录");
    } else {
      state.records.push({ id: Date.now() + "" + Math.floor(Math.random() * 999), start: start, duration: dur });
      toast("已保存记录");
    }
    state.records.sort((a, b) => a.start.localeCompare(b.start));
    save();
    resetForm();
    renderRecords();
    switchView("dashboard");
    renderDashboard();
  }

  function editRecord(id) {
    const r = state.records.find((x) => x.id === id);
    if (!r) return;
    editingId = id;
    document.getElementById("form-title").textContent = "编辑记录";
    document.getElementById("form-submit").textContent = "更新记录";
    document.getElementById("form-cancel").style.display = "";
    document.getElementById("in-start").value = r.start;
    document.getElementById("in-duration").value = r.duration;
    switchView("record");
    window.scrollTo(0, 0);
  }

  function deleteRecord(id) {
    if (!confirm("确定删除这条记录吗？")) return;
    state.records = state.records.filter((x) => x.id !== id);
    save();
    if (editingId === id) resetForm();
    renderRecords();
    renderDashboard();
    toast("已删除");
  }

  /* ---------------- 设置 ---------------- */
  function applyTheme(name) {
    const th = THEMES[name] || THEMES.rose;
    const r = document.documentElement.style;
    r.setProperty("--accent", th.accent);
    r.setProperty("--accent-soft", th.soft);
    r.setProperty("--accent-ink", th.ink);
  }

  function renderSwatches() {
    const wrap = document.getElementById("swatches");
    wrap.innerHTML = "";
    Object.keys(THEMES).forEach((k) => {
      const s = document.createElement("div");
      s.className = "swatch" + (state.settings.theme === k ? " active" : "");
      s.style.background = THEMES[k].accent;
      s.dataset.theme = k;
      s.addEventListener("click", () => {
        state.settings.theme = k;
        save();
        applyTheme(k);
        renderSwatches();
        renderDashboard();
        toast("主题已更新");
      });
      wrap.appendChild(s);
    });
  }

  function syncSettingsInputs() {
    document.getElementById("in-cycle").value = state.settings.cycle;
    document.getElementById("in-period-len").value = state.settings.periodLen;
    const seg = document.getElementById("week-seg");
    seg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", +b.dataset.val === +state.settings.weekStart);
    });
  }

  /* ---------------- 导出 ---------------- */
  function exportData() {
    if (!state.records.length) { toast("暂无数据可导出"); return; }
    const sorted = state.records.slice().sort((a, b) => a.start.localeCompare(b.start));
    const rows = [["序号", "开始日期", "结束日期", "经期天数", "距上次周期(天)"]];
    sorted.forEach((r, i) => {
      const s = parseYMD(r.start);
      const e = addDays(s, r.duration - 1);
      const prev = i > 0 ? parseYMD(sorted[i - 1].start) : null;
      const gap = prev ? diffDays(prev, s) : "";
      rows.push([i + 1, r.start, ymd(e), r.duration, gap]);
    });

    const stamp = ymd(today());
    const filename = "亲戚来了-经期数据-" + stamp;

    if (typeof XLSX !== "undefined") {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "经期记录");
      XLSX.writeFile(wb, filename + ".xlsx");
      toast("已导出 Excel");
    } else {
      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, filename + ".csv");
      toast("已导出 CSV（Excel 可打开）");
    }
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------------- 视图切换 ---------------- */
  function switchView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById("view-" + name).classList.add("active");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
    if (name === "dashboard") renderDashboard();
    if (name === "record") renderRecords();
    if (name === "settings") { syncSettingsInputs(); }
  }

  /* ---------------- Toast ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  /* ---------------- 绑定事件 ---------------- */
  function bind() {
    // 导航
    document.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => switchView(t.dataset.view))
    );
    document.getElementById("go-record").addEventListener("click", () => {
      resetForm(); switchView("record");
    });

    // 日历翻月
    const t = today();
    viewYear = t.getFullYear(); viewMonth = t.getMonth();
    document.getElementById("cal-prev").addEventListener("click", () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } renderCalendar();
    });
    document.getElementById("cal-next").addEventListener("click", () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } renderCalendar();
    });

    // 表单
    document.getElementById("form-submit").addEventListener("click", submitForm);
    document.getElementById("form-cancel").addEventListener("click", () => { resetForm(); });
    const durInput = document.getElementById("in-duration");
    document.getElementById("dur-minus").addEventListener("click", () => {
      let v = parseInt(durInput.value, 10) || 1; if (v > 1) durInput.value = v - 1;
    });
    document.getElementById("dur-plus").addEventListener("click", () => {
      let v = parseInt(durInput.value, 10) || 1; if (v < 15) durInput.value = v + 1;
    });

    // 列表操作（事件委托）
    document.getElementById("record-list").addEventListener("click", (e) => {
      const ed = e.target.closest("[data-edit]");
      const dl = e.target.closest("[data-del]");
      if (ed) editRecord(ed.dataset.edit);
      if (dl) deleteRecord(dl.dataset.del);
    });

    // 设置：周期 / 经期时长
    const cyc = document.getElementById("in-cycle");
    const pl = document.getElementById("in-period-len");
    function bump(input, min, max, delta) {
      let v = parseInt(input.value, 10); if (isNaN(v)) v = min;
      v = Math.max(min, Math.min(max, v + delta)); input.value = v;
      return v;
    }
    document.getElementById("cyc-minus").addEventListener("click", () => { state.settings.cycle = bump(cyc, 20, 45, -1); save(); renderDashboard(); });
    document.getElementById("cyc-plus").addEventListener("click", () => { state.settings.cycle = bump(cyc, 20, 45, 1); save(); renderDashboard(); });
    document.getElementById("pl-minus").addEventListener("click", () => { state.settings.periodLen = bump(pl, 2, 12, -1); save(); renderDashboard(); });
    document.getElementById("pl-plus").addEventListener("click", () => { state.settings.periodLen = bump(pl, 2, 12, 1); save(); renderDashboard(); });
    cyc.addEventListener("change", () => { let v = parseInt(cyc.value, 10); if (isNaN(v)) v = 28; v = Math.max(20, Math.min(45, v)); cyc.value = v; state.settings.cycle = v; save(); renderDashboard(); });
    pl.addEventListener("change", () => { let v = parseInt(pl.value, 10); if (isNaN(v)) v = 5; v = Math.max(2, Math.min(12, v)); pl.value = v; state.settings.periodLen = v; save(); renderDashboard(); });

    // 每周起始
    document.getElementById("week-seg").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      state.settings.weekStart = +b.dataset.val; save(); syncSettingsInputs(); renderCalendar();
    });

    // 导出 / 清空
    document.getElementById("btn-export").addEventListener("click", exportData);
    document.getElementById("btn-clear").addEventListener("click", () => {
      if (!confirm("将清空全部经期记录与设置，确定吗？")) return;
      state = { records: [], settings: { cycle: 28, periodLen: 5, theme: state.settings.theme, weekStart: state.settings.weekStart } };
      save(); applyTheme(state.settings.theme); renderSwatches(); syncSettingsInputs();
      renderRecords(); renderDashboard(); toast("已清空");
    });
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    applyTheme(state.settings.theme);
    renderSwatches();
    bind();
    resetForm();
    switchView("dashboard");
  }

  document.addEventListener("DOMContentLoaded", init);

  /* 注册 Service Worker：支持主屏独立运行 + 离线 */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
