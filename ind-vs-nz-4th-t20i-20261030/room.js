const API = "";
let state = {
  code: "",
  name: localStorage.getItem("indiavs_name") || "",
  seq: 0,
  pollTimer: null,
  predictWindow: localStorage.getItem("indiavs_predict_window") || "next_over",
};

function $(id) {
  return document.getElementById(id);
}

function showRoom(show) {
  $("join-panel").style.display = show ? "none" : "block";
  $("room-panel").style.display = show ? "block" : "none";
  const formPanel = $("squad-form-panel");
  if (formPanel) formPanel.style.display = "block";
  if (window.IndiavsMatchCanvas) {
    window.IndiavsMatchCanvas.syncVisibility();
    if (typeof window.IndiavsMatchCanvas.relayout === "function") {
      window.IndiavsMatchCanvas.relayout();
    }
  }
}

function focusField(id) {
  const el = $(id);
  if (el) {
    el.focus();
    el.classList.add("input-error");
    setTimeout(() => el.classList.remove("input-error"), 2500);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function speakFanBox(text) {
  if (!text || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "hi-IN";
  speechSynthesis.speak(u);
}

function bandClass(band) {
  if (band === "strong") return "form-strong";
  if (band === "caution") return "form-caution";
  return "form-neutral";
}

let squadFormState = { squad: "india_t20", match: "", xi: false };
let squadFormBodyOpen = false;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatMatchDayMonth(isoDate) {
  const raw = String(isoDate || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const day = String(parseInt(m[3], 10));
  const month = MONTH_NAMES[parseInt(m[2], 10) - 1] || "";
  if (!month) return "";
  return `${day}/ ${month}`;
}

function setSquadFormBodyOpen(open) {
  squadFormBodyOpen = Boolean(open);
  const body = $("squad-form-body");
  const btn = $("btn-squad-form-toggle");
  if (body) {
    body.classList.toggle("is-collapsed", !squadFormBodyOpen);
    body.hidden = !squadFormBodyOpen;
  }
  if (btn) {
    btn.setAttribute("aria-expanded", squadFormBodyOpen ? "true" : "false");
    btn.textContent = squadFormBodyOpen ? "Hide Form Index ›" : "Show Form Index ›";
  }
}

function renderNextMatchBanner(fixture) {
  const el = $("squad-form-next-match");
  if (!el) return;
  const dateLabel = formatMatchDayMonth(fixture?.match_date);
  const title = String(fixture?.title || "").trim();
  if (title && dateLabel) {
    el.textContent = `For prediction — ${title} · ${dateLabel}`;
    return;
  }
  if (!dateLabel) {
    el.textContent = "For prediction — next match date coming soon";
    return;
  }
  el.textContent = `For prediction — next match is on ${dateLabel}`;
}

function outlookClass(tone) {
  if (tone === "tight") return "outlook-tight";
  if (tone === "favourable") return "outlook-favourable";
  return "outlook-balanced";
}

function barFillClass(band) {
  if (band === "strong") return "form-bar-strong";
  if (band === "caution") return "form-bar-caution";
  return "form-bar-neutral";
}

function renderFormBarChart(players, { xiOnly }, chartEl) {
  const chart = chartEl || $("squad-form-chart-home");
  if (!chart) return;
  const rows = (players || []).filter((p) => {
    if (!xiOnly) return true;
    return p.playing_xi !== false;
  });
  if (!rows.length) {
    chart.innerHTML = "<p class=\"tagline\">No Form Index data yet.</p>";
    return;
  }
  chart.innerHTML = rows
    .map((p) => {
      const score = typeof p.form_index === "number" ? p.form_index : 0;
      const width = Math.max(4, Math.min(100, score));
      const label = typeof p.form_index === "number" ? score : "—";
      const cap = p.name && p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name || "";
      const xiTag = p.playing_xi ? '<span class="form-xi-tag">XI</span>' : "";
      return `<div class="form-bar-row ${bandClass(p.band)}${p.playing_xi ? " form-bar-xi" : ""}" title="${escapeHtml(p.hint || "")}">
        <span class="form-bar-name">${escapeHtml(cap)}${xiTag}</span>
        <div class="form-bar-track" aria-hidden="true">
          <div class="form-bar-fill ${barFillClass(p.band)}" style="width:${width}%"></div>
        </div>
        <span class="form-bar-score">${label}</span>
      </div>`;
    })
    .join("");
}

function showFormLoading() {
  const panel = $("squad-form-panel");
  if (!panel) return;
  panel.style.display = "block";
  $("squad-form-subtitle").textContent = "Loading today's predictive performance…";
  const avgHome = $("squad-form-avg-home");
  const avgOpp = $("squad-form-avg-opp");
  if (avgHome) avgHome.textContent = "";
  if (avgOpp) avgOpp.textContent = "";
  const chartHome = $("squad-form-chart-home");
  const chartOpp = $("squad-form-chart-opp");
  if (chartHome) chartHome.innerHTML = '<p class="tagline">Fetching Form Index…</p>';
  if (chartOpp) chartOpp.innerHTML = "";
  const oppWrap = $("squad-form-opp-wrap");
  if (oppWrap) oppWrap.hidden = true;
  const outlookEl = $("match-outlook");
  if (outlookEl) outlookEl.style.display = "none";
}

function renderSideForm(sideData, opts) {
  const { chartId, avgId, labelId, xiOnly, fallbackLabel } = opts;
  const labelEl = $(labelId);
  const avgEl = $(avgId);
  const chartEl = $(chartId);
  if (!sideData || !chartEl) return;
  const squad = sideData.squad || {};
  if (labelEl) {
    labelEl.textContent = fallbackLabel || squad.label || "Squad";
  }
  const squadAvg = sideData.squad_avg;
  const xiAvg = sideData.playing_xi_avg;
  const xiCount = sideData.playing_xi_count;
  if (avgEl) {
    const bits = [];
    if (typeof squadAvg === "number") bits.push(`Squad ${squadAvg}`);
    if (typeof xiAvg === "number" && xiCount) bits.push(`XI ${xiAvg}`);
    avgEl.textContent = bits.length ? bits.join(" · ") + "/100" : "";
  }
  renderFormBarChart(sideData.players || [], { xiOnly: false }, chartEl);
}

function renderSquadForm(data) {
  const panel = $("squad-form-panel");
  if (!panel || !data || !data.players || !data.players.length) {
    if (panel) {
      panel.style.display = "block";
      const chartHome = $("squad-form-chart-home");
      if (chartHome) {
        chartHome.innerHTML = "<p class=\"tagline\">Form Index unavailable right now. Please try again later.</p>";
      }
    }
    return;
  }
  panel.style.display = "block";
  const match = data.match || {};
  const squad = data.squad || {};
  const opp = data.opponent;
  const subtitle = [
    match.playing_xi_count ? "Full squad · XI tagged" : squad.label,
    match.title,
    match.venue,
    match.date ? `match day ${match.date}` : "today",
  ]
    .filter(Boolean)
    .join(" · ");
  $("squad-form-subtitle").textContent = subtitle || "Proprietary algorithms + traditional timing";

  const outlookEl = $("match-outlook");
  const outlook = data.match_outlook || {};
  if (outlookEl && outlook.headline) {
    outlookEl.style.display = "block";
    outlookEl.className = "match-outlook " + outlookClass(outlook.tone);
    $("match-outlook-headline").textContent = outlook.headline;
    $("match-outlook-detail").textContent = outlook.detail || "";
    const lead = data.leadership || {};
    $("match-outlook-leadership").textContent =
      `Captain ${lead.captain_index ?? "—"} · Coach ${lead.coach_index ?? "—"} · ` +
      `Match blend ${outlook.composite_index ?? "—"}/100`;
  } else if (outlookEl) {
    outlookEl.style.display = "none";
  }

  renderSideForm(data, {
    chartId: "squad-form-chart-home",
    avgId: "squad-form-avg-home",
    labelId: "squad-form-home-label",
    fallbackLabel: "India",
  });
  const oppWrap = $("squad-form-opp-wrap");
  if (opp && opp.players && opp.players.length) {
    if (oppWrap) oppWrap.hidden = false;
    renderSideForm(opp, {
      chartId: "squad-form-chart-opp",
      avgId: "squad-form-avg-opp",
      labelId: "squad-form-opp-label",
      fallbackLabel: match.opponent_label || "Opposition",
    });
  } else if (oppWrap) {
    oppWrap.hidden = true;
  }
  $("squad-form-disclaimer").textContent = data.disclaimer || "";
}

async function bootstrapSquadForm() {
  let nextBanner = null;
  try {
    const sched = await api("/api/cricket/schedule");
    nextBanner = sched.next_fixture || sched.active_fixture || null;
    renderNextMatchBanner(nextBanner);
    const active = sched.active_fixture || sched.next_fixture;
    if (active) {
      if (active.squad_id) squadFormState.squad = active.squad_id;
      if (active.id) squadFormState.match = active.id;
    }
  } catch (_) {
    renderNextMatchBanner(null);
  }

  try {
    const data = await api("/api/squad-form/active");
    if (data && data.players && data.players.length) {
      if (data.squad && data.squad.id) squadFormState.squad = data.squad.id;
      if (data.match && data.match.id) squadFormState.match = data.match.id;
      // Prefer schedule date; fall back to match day from form payload.
      if (!nextBanner?.match_date && data.match?.match_date) {
        renderNextMatchBanner({ match_date: data.match.match_date });
      }
      renderSquadForm(data);
      return;
    }
  } catch (_) {}
  loadSquadForm();
}

async function loadSquadForm() {
  showFormLoading();
  try {
    const q = new URLSearchParams();
    q.set("squad", squadFormState.squad);
    if (squadFormState.match) q.set("match", squadFormState.match);
    if (squadFormState.xi) q.set("playing_xi", "1");
    const data = await api("/api/squad-form?" + q.toString());
    renderSquadForm(data);
  } catch (_) {
    const panel = $("squad-form-panel");
    if (panel) {
      panel.style.display = "block";
      const chartHome = $("squad-form-chart-home");
      if (chartHome) {
        chartHome.innerHTML =
          "<p class=\"tagline\">Could not load Form Index. Is indiavs running on port 5004?</p>";
      }
    }
  }
}

function setupSquadTabs() {
  document.querySelectorAll(".squad-tab").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".squad-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      squadFormState.squad = btn.getAttribute("data-squad") || "india_t20";
      squadFormState.match = btn.getAttribute("data-match") || "";
      squadFormState.xi = btn.getAttribute("data-xi") === "1" || Boolean(btn.getAttribute("data-match"));
      if (!squadFormBodyOpen) setSquadFormBodyOpen(true);
      loadSquadForm();
    };
  });
}

function setupSquadFormCollapse() {
  const btn = $("btn-squad-form-toggle");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  setSquadFormBodyOpen(false);
  btn.addEventListener("click", () => setSquadFormBodyOpen(!squadFormBodyOpen));
}

function enterRoom(code, room) {
  state.code = code;
  localStorage.setItem("indiavs_room", code);
  showRoom(true);
  setChatEnabled(true, code);
  setupWhatsAppShare();
  loadPageWatch();
  renderRoom(room);
  loadRoomWidgets();
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(pollRoom, 12000);
  pollRoom();
}

function setupWhatsAppShare() {
  const url = window.location.origin + "/room.html?code=" + (state.code || "");
  const text = state.code
    ? encodeURIComponent(`Join Kirkit ka Nostradamus in our indiavs room (${state.code}): ${url}`)
    : encodeURIComponent(`Match night on indiavs — watch + chat: ${window.location.origin}/room.html`);
  const btn = $("btn-whatsapp");
  if (btn) {
    btn.href = "https://wa.me/?text=" + text;
    btn.textContent = state.code ? `Share room ${state.code} on WhatsApp` : "Share indiavs room on WhatsApp";
  }
}

async function loadPageWatch() {
  try {
    const watch = await fetchWatch();
    if (window.applyMatchDeskWatch) await window.applyMatchDeskWatch(watch);
    setupCommentaryEngagement(watch, $("commentary-engage"), { roomCode: state.code || "" });
    if (window.setupFanWatchReactions) window.setupFanWatchReactions();
    if (window.setupYoutubeModeTabs) window.setupYoutubeModeTabs(watch);
    // Live player is owned by match_desk (Listen live ↔ Watch video switch).
    // Do NOT poll a second live iframe here — that caused dual audio.
  } catch (_) {
    const el = $("page-youtube");
    if (el) {
      el.innerHTML =
        '<p class="tagline">Live commentary during match timings · highlights post match. Refresh page if needed.</p>';
    }
  }
}

function renderChatMessages(messages) {
  const chat = $("chat-log");
  if (!chat) return;
  const me = (state.name || "").trim().toLowerCase();
  const rows = messages || [];
  if (!rows.length && !state.code) {
    chat.innerHTML =
      '<div class="wa-bubble wa-in"><span class="wa-sender">indiavs</span>Match night! Join room, then friends see the same chat here.</div>';
    return;
  }
  chat.innerHTML = rows
    .slice(-30)
    .map((x) => {
      if (x.kirkit === "result" && x.kirkit_card) {
        return kirkitResultBubble(x);
      }
      if (x.system) {
        return `<div class="wa-bubble wa-sys">${escapeHtml(x.message || "")}</div>`;
      }
      const player = String(x.player || "Friend");
      const out = player.toLowerCase() === me;
      return (
        `<div class="wa-msg-row ${out ? "wa-row-out" : "wa-row-in"}">` +
        `<div class="wa-bubble ${out ? "wa-out" : "wa-in"}">` +
        (out ? "" : `<span class="wa-sender">${escapeHtml(player)}</span>`) +
        `${escapeHtml(x.message || "")}</div></div>`
      );
    })
    .join("");
  chat.scrollTop = chat.scrollHeight;
}

function setChatEnabled(on, roomCode) {
  const input = $("chat-input");
  const btn = $("btn-chat");
  const label = $("chat-room-label");
  if (input) {
    input.disabled = !on;
    input.placeholder = on ? "Type a message to your friends…" : "Join room first — enter name above";
  }
  if (btn) btn.disabled = !on;
  if (label) {
    label.textContent = on
      ? `Room ${roomCode} · Kirkit ka Nostradamus with friends`
      : "Join a room to talk with your group";
  }
}

function renderRoom(room) {
  if (!room) return;
  $("room-title-display").textContent = room.title || "Room";
  $("room-code-display").textContent = room.code || state.code;
  const score = room.last_score || {};
  $("score-bar").textContent = score.summary || "Score updating…";

  const fb = $("fanbox-feed");
  const lines = room.fanbox || [];
  if (!lines.length) {
    fb.innerHTML = '<div class="feed-line feed-empty">Fan Box is live — lines appear as the score moves.</div>';
  } else {
    fb.innerHTML = lines
      .slice(-15)
      .map((x) => `<div class="feed-line">${escapeHtml(x.line || "")}</div>`)
      .join("");
  }
  const last = lines.slice(-1)[0];
  if (last && last.id > (state.lastFanId || 0)) {
    state.lastFanId = last.id;
    if (last.line) speakFanBox(last.line);
  }

  const lb = $("leaderboard");
  const seer = room.kirkit && room.kirkit.seer;
  lb.innerHTML = (room.leaderboard || [])
    .map((x, i) => {
      const crown = seer && x.name === seer ? " ★" : "";
      const hits = x.kirkit_hits != null ? ` · ${x.kirkit_hits} hits` : "";
      return `<li><span>${i + 1}. ${escapeHtml(x.name)}${crown}</span><span>${x.points} pts${hits}</span></li>`;
    })
    .join("");

  renderChatMessages(room.chat || []);
  renderKirkit(room);
}

const KIRKIT_MAX = { runs: 36, fours: 6, sixes: 6, wickets: 6 };

function kirkitInput(stat) {
  return $("kirkit-" + stat);
}

function kirkitReadSlip() {
  const n = (stat, fallback) => {
    const el = kirkitInput(stat);
    const v = el ? parseInt(el.value, 10) : fallback;
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    runs: n("runs", 8),
    fours: n("fours", 1),
    sixes: n("sixes", 0),
    wickets: n("wickets", 0),
  };
}

function kirkitWriteSlip(slip) {
  ["runs", "fours", "sixes", "wickets"].forEach((stat) => {
    const el = kirkitInput(stat);
    if (el && slip && slip[stat] != null) el.value = String(slip[stat]);
  });
}

function kirkitBump(stat, dir) {
  const el = kirkitInput(stat);
  if (!el) return;
  const max = KIRKIT_MAX[stat] || 6;
  let v = parseInt(el.value, 10);
  if (!Number.isFinite(v)) v = 0;
  el.value = String(Math.max(0, Math.min(max, v + dir)));
}

function kirkitResultBubble(x) {
  const card = x.kirkit_card || {};
  const actual = card.actual || {};
  const scores = card.scores || [];
  const lines = scores
    .map((s) => {
      const p = s.pred || {};
      return (
        `<div class="wa-kirkit-line"><span>${escapeHtml(s.name)}</span>` +
        `<span>+${s.points} · ${p.runs || 0}r ${p.fours || 0}×4 ${p.sixes || 0}×6 ${p.wickets || 0}w</span></div>`
      );
    })
    .join("");
  const award = card.seer
    ? `<div class="wa-kirkit-line"><span>${escapeHtml(card.award_title || "Kirkit ka Nostradamus")}</span><span>${escapeHtml(card.seer)}</span></div>`
    : "";
  return (
    `<div class="wa-bubble wa-sys wa-kirkit-sticker">` +
    `<strong>Kirkit ka Nostradamus · Over ${card.over != null ? card.over : "?"}</strong>` +
    `<div>${escapeHtml(x.message || "")}</div>` +
    `<div class="wa-kirkit-line"><span>Actual</span><span>${actual.runs || 0}r · ${actual.fours || 0} fours · ${actual.sixes || 0} sixes · ${actual.wickets || 0} wkt</span></div>` +
    lines +
    award +
    `</div>`
  );
}

function renderKirkit(room) {
  const statusEl = $("kirkit-status");
  const awardEl = $("kirkit-award");
  const friendsEl = $("kirkit-friends");
  const lastEl = $("kirkit-last");
  const sealBtn = $("btn-kirkit-seal");
  const k = room && room.kirkit;
  if (awardEl) {
    awardEl.textContent = k && k.seer
      ? `${k.seer} holds the Kirkit ka Nostradamus award`
      : "No seer yet — first over to score takes the award.";
  }
  if (!k || !k.round) {
    if (statusEl) statusEl.textContent = "Waiting for the next over to open…";
    if (sealBtn) sealBtn.disabled = !state.code;
    if (friendsEl) friendsEl.innerHTML = "";
  } else {
    const rnd = k.round;
    const mine = state.name && rnd.slips && rnd.slips[state.name];
    if (mine) kirkitWriteSlip(mine);
    const status = rnd.status || "open";
    const over = rnd.over;
    if (statusEl) {
      if (status === "bowling") {
        statusEl.textContent = `Over ${over} underway — slips frozen. Result after the over.`;
      } else if (mine) {
        statusEl.textContent = `Over ${over} sealed: ${mine.runs} runs · ${mine.fours} fours · ${mine.sixes} sixes · ${mine.wickets} wkt. You can still edit until the over starts.`;
      } else {
        statusEl.textContent = `Next over is ${over}. Seal runs, fours, sixes and wickets before it begins.`;
      }
    }
    if (sealBtn) {
      sealBtn.disabled = !state.code || status === "bowling";
      sealBtn.textContent = mine ? `Update Over ${over} slip` : `Seal Over ${over}`;
    }
    const names = Object.keys(rnd.slips || {});
    if (friendsEl) {
      friendsEl.innerHTML = names.length
        ? names
            .map((n) => {
              const s = rnd.slips[n];
              return (
                `<div class="kirkit-friend"><span>${escapeHtml(n)}</span>` +
                `<span>${s.runs}r · ${s.fours}×4 · ${s.sixes}×6 · ${s.wickets}w</span></div>`
              );
            })
            .join("")
        : '<p class="tagline">No friends sealed this over yet.</p>';
    }
  }
  if (lastEl) {
    const last = k && k.last_result;
    if (!last) {
      lastEl.innerHTML = "";
    } else {
      const a = last.actual || {};
      const top = (last.scores || [])[0];
      lastEl.innerHTML =
        `<div class="kirkit-last-actual">Last over ${last.over}: ${a.runs || 0} runs · ${a.fours || 0} fours · ${a.sixes || 0} sixes · ${a.wickets || 0} wkt` +
        (top ? ` · ${escapeHtml(top.name)} +${top.points}` : "") +
        `</div>`;
    }
  }
}

function predictWindowLabel(mode) {
  return mode === "five_min" ? "next 5 minutes" : "next over";
}

function updatePredictHint(room) {
  const hint = $("predict-window-hint");
  if (!hint) return;
  const open = room?.predictions_open || {};
  const mine = state.name && open[state.name];
  if (mine) {
    const win = predictWindowLabel(mine.window || "next_over");
    const pred = String(mine.prediction || "").replace(/_/g, " ");
    hint.textContent = `Locked in: ${pred} in the ${win} — result when window ends.`;
    return;
  }
  hint.textContent = `Pick what happens in the ${predictWindowLabel(state.predictWindow)} — not the next ball.`;
}

function setupPredictWindowTabs() {
  document.querySelectorAll(".predict-window-tab").forEach((btn) => {
    const mode = btn.getAttribute("data-window") || "next_over";
    btn.classList.toggle("active", mode === state.predictWindow);
    btn.onclick = () => {
      state.predictWindow = mode;
      localStorage.setItem("indiavs_predict_window", mode);
      document.querySelectorAll(".predict-window-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const hint = $("predict-window-hint");
      if (hint) hint.textContent = `Pick what happens in the ${predictWindowLabel(mode)} — not the next ball.`;
    };
  });
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function createRoom() {
  const name = ($("player-name").value || "").trim();
  if (!name) {
    alert("Please enter your name first.");
    focusField("player-name");
    return;
  }
  state.name = name;
  localStorage.setItem("indiavs_name", name);
  const room = await api("/api/rooms", {
    method: "POST",
    body: JSON.stringify({
      host: name,
      title: ($("room-title").value || "").trim() || "India match room",
      tone: $("tone").value,
    }),
  });
  enterRoom(room.code, room);
}

async function joinRoom() {
  const name = ($("player-name").value || "").trim();
  const code = ($("room-code").value || "").trim().toUpperCase();
  if (!name) {
    alert("Please enter your name first.");
    focusField("player-name");
    return;
  }
  if (!code) {
    return createRoom();
  }
  state.name = name;
  localStorage.setItem("indiavs_name", name);
  const room = await api(`/api/rooms/${code}/join`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  enterRoom(code, room);
}

async function loadRoomWidgets() {
  const el = $("room-widgets");
  if (!el) return;
  try {
    const data = await fetchWidgets();
    renderWidgets(el, data);
  } catch (_) {
    el.innerHTML = "";
  }
}

async function pollRoom() {
  if (!state.code) return;
  try {
    const room = await api(`/api/rooms/${state.code}/poll`);
    renderRoom(room);
  } catch (_) {}
}

function setupWhatsApp(watch) {
  setupWhatsAppShare();
}

async function loadWatchInRoom() {
  setupWhatsAppShare();
}

function exitRoomUi() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  state.code = "";
  state.seq = 0;
  state.lastFanId = 0;
  localStorage.removeItem("indiavs_room");
  showRoom(false);
  setChatEnabled(false, "");
  setupWhatsAppShare();
  renderChatMessages([]);
}

async function leaveRoom() {
  if (!state.code) return;
  const code = state.code;
  const name = state.name;
  try {
    if (name) {
      await api(`/api/rooms/${code}/leave`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    }
  } catch (_) {}
  exitRoomUi();
}

async function resumeRoom(code, name) {
  if (!code || !name) return false;
  try {
    const room = await api(`/api/rooms/${code}/join`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    state.name = name;
    enterRoom(code, room);
    return true;
  } catch (_) {
    localStorage.removeItem("indiavs_room");
    return false;
  }
}

$("btn-create").onclick = () => createRoom().catch((e) => alert(e.message));
$("btn-join").onclick = () => joinRoom().catch((e) => alert(e.message));
$("btn-leave").onclick = () => leaveRoom().catch((e) => alert(e.message));

$("btn-chat").onclick = async () => {
  const message = ($("chat-input").value || "").trim();
  if (!state.code) {
    alert("Enter your name and tap Join room first — then friends can chat here.");
    focusField("player-name");
    return;
  }
  if (!message) return;
  const room = await api(`/api/rooms/${state.code}/chat`, {
    method: "POST",
    body: JSON.stringify({ name: state.name, message }),
  });
  $("chat-input").value = "";
  renderRoom(room);
};

$("chat-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("btn-chat").click();
  }
});

$("btn-ask").onclick = async () => {
  const question = ($("ask-input").value || "").trim();
  if (!question || !state.code) return;
  const room = await api(`/api/rooms/${state.code}/ask`, {
    method: "POST",
    body: JSON.stringify({ name: state.name, question }),
  });
  $("ask-input").value = "";
  renderRoom(room);
};

document.querySelectorAll(".kirkit-minus").forEach((btn) => {
  btn.onclick = () => kirkitBump(btn.getAttribute("data-stat"), -1);
});
document.querySelectorAll(".kirkit-plus").forEach((btn) => {
  btn.onclick = () => kirkitBump(btn.getAttribute("data-stat"), 1);
});
const kirkitSeal = $("btn-kirkit-seal");
if (kirkitSeal) {
  kirkitSeal.onclick = async () => {
    if (!state.code) {
      alert("Enter your name and join a room first — then seal the next over with friends.");
      focusField("player-name");
      return;
    }
    try {
      const slip = kirkitReadSlip();
      const room = await api(`/api/rooms/${state.code}/kirkit`, {
        method: "POST",
        body: JSON.stringify({ name: state.name, ...slip }),
      });
      renderRoom(room);
    } catch (e) {
      const err = String(e.message || e);
      if (err === "too_late") alert("That over has started — wait for the next over.");
      else if (err === "locked") alert("This over is underway. Slips are frozen.");
      else if (err === "no_round") alert("Next over is not open yet. Wait a moment.");
      else alert(err);
    }
  };
}

document.querySelectorAll("#predict-grid button").forEach((btn) => {
  btn.onclick = async () => {
    if (!state.code) return;
    const prediction = btn.getAttribute("data-pred");
    const room = await api(`/api/rooms/${state.code}/predict`, {
      method: "POST",
      body: JSON.stringify({
        name: state.name,
        prediction,
        window: state.predictWindow,
      }),
    });
    renderRoom(room);
    const label = predictWindowLabel(state.predictWindow);
    btn.blur();
    const hint = $("predict-window-hint");
    if (hint) {
      hint.textContent = `Locked in: ${prediction.replace(/_/g, " ")} in the ${label} — enjoy the radio vibes till then.`;
    }
  };
});

$("btn-share").onclick = () => {
  const url = window.location.origin + "/room.html?code=" + state.code;
  if (navigator.share) {
    navigator.share({ title: "indiavs room", url }).catch(() => {});
  } else {
    navigator.clipboard.writeText(url);
    alert("Link copied");
  }
};

if (state.name) $("player-name").value = state.name;
setupSquadFormCollapse();
setupSquadTabs();
setupPredictWindowTabs();
bootstrapSquadForm();
if (window.initMatchDesk) initMatchDesk({ page: "room" });
if (window.startLiveScoreStrip) startLiveScoreStrip("live-score-strip");
if (window.IndiavsCricketScorecard && typeof window.IndiavsCricketScorecard.mount === "function") {
  window.IndiavsCricketScorecard.mount();
}
loadPageWatch();
setupWhatsAppShare();
setChatEnabled(false, "");

fetch("/api/meta")
  .then((r) => r.json())
  .then((m) => {
    if (m.affidavits_url) $("aff-room").href = m.affidavits_url;
  });

const params = new URLSearchParams(window.location.search);
const deepCode = (params.get("code") || localStorage.getItem("indiavs_room") || "").trim().toUpperCase();
if (deepCode) {
  $("room-code").value = deepCode;
}
if (deepCode && state.name) {
  resumeRoom(deepCode, state.name).catch(() => {});
}

function scrollToKirkitIfNeeded() {
  const hash = (window.location.hash || "").replace("#", "");
  if (hash !== "kirkit-card" && hash !== "kirkit") return;
  const el = $("kirkit-card");
  if (!el) return;
  window.setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
}
scrollToKirkitIfNeeded();
window.addEventListener("hashchange", scrollToKirkitIfNeeded);
