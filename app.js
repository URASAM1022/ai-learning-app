(function () {
  "use strict";

  const GRADES = [1, 2, 3, 4, 5, 6];
  const SUBJECTS = ["国語", "算数", "理科", "社会", "英語"];
  const DAILY_COUNT = 5;
  const HISTORY_KEY = "dailyAiStudy.history.v1";
  const app = document.querySelector("#app");
  const state = {
    view: "home",
    grade: null,
    subject: null,
    problems: [],
    queue: [],
    currentIndex: 0,
    selected: null,
    checked: false,
    answers: [],
    reviewMode: false
  };

  document.querySelector("#homeButton").addEventListener("click", showHome);
  document.querySelector("#historyButton").addEventListener("click", showHistory);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  showHome();

  function setView(name) {
    state.view = name;
    app.innerHTML = "";
  }

  function panel() {
    const node = document.querySelector("#cardTemplate").content.firstElementChild.cloneNode(true);
    app.appendChild(node);
    return node;
  }

  function showHome() {
    setView("home");
    const node = panel();
    node.classList.add("hero");
    node.innerHTML = `
      <div class="hero-copy">
        <h2>今日の学びを、楽しく少しずつ。</h2>
        <p>学年と教科を選ぶだけで、日替わりの問題に取り組めます。図やカードを見ながら考えて、まちがえた問題はその場で復習できます。</p>
        <div class="action-row">
          <button class="button" type="button" data-start>学年をえらぶ</button>
          <button class="button secondary" type="button" data-history>学習履歴</button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">${heroSvg()}</div>
    `;
    node.querySelector("[data-start]").addEventListener("click", showGradeSelect);
    node.querySelector("[data-history]").addEventListener("click", showHistory);
  }

  function showGradeSelect() {
    setView("grade");
    const node = panel();
    node.innerHTML = `<h2>学年をえらんでください</h2><div class="grid"></div>`;
    const grid = node.querySelector(".grid");
    GRADES.forEach((grade) => {
      const button = document.createElement("button");
      button.className = "button tile";
      button.type = "button";
      button.innerHTML = `<strong>${grade}年生</strong><span>今日の問題へ</span>`;
      button.addEventListener("click", () => {
        state.grade = grade;
        showSubjectSelect();
      });
      grid.appendChild(button);
    });
  }

  function showSubjectSelect() {
    setView("subject");
    const node = panel();
    node.innerHTML = `
      <div class="meta-row"><span class="badge">${state.grade}年生</span></div>
      <h2>教科をえらんでください</h2>
      <div class="grid subject-grid"></div>
    `;
    const grid = node.querySelector(".grid");
    SUBJECTS.forEach((subject) => {
      const button = document.createElement("button");
      button.className = "button tile";
      button.type = "button";
      button.innerHTML = `<strong>${subject}</strong><span>5問</span>`;
      button.addEventListener("click", () => startStudy(subject));
      grid.appendChild(button);
    });
  }

  async function startStudy(subject) {
    state.subject = subject;
    setView("loading");
    panel().innerHTML = `<h2>今日の問題を用意しています</h2><p class="mini">少しだけ待ってください。</p>`;
    try {
      const all = await loadProblems(state.grade);
      const filtered = all.filter((item) => item.subject === subject);
      const quality = filtered.filter((item) => item.qualityChecked === true && item.copyrightSafe === true);
      state.problems = quality;
      state.queue = pickDailyProblems(quality, state.grade, subject);
      state.currentIndex = 0;
      state.answers = [];
      state.reviewMode = false;
      showQuestion();
    } catch (error) {
      showError("問題データを読み込めませんでした。ページを再読み込みしてください。");
    }
  }

  async function loadProblems(grade) {
    const res = await fetch(`./problems/grade${grade}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error("load failed");
    const data = await res.json();
    validateProblems(data, grade);
    return data;
  }

  function validateProblems(data, grade) {
    const required = ["id", "grade", "subject", "question", "choices", "answer", "explanation", "hint", "visualType", "visualData", "qualityChecked", "copyrightSafe"];
    const seen = new Set();
    data.forEach((item) => {
      required.forEach((key) => {
        if (!(key in item)) throw new Error(`missing ${key}`);
      });
      if (item.grade !== grade || seen.has(item.id)) throw new Error("invalid problem");
      seen.add(item.id);
      if (!Array.isArray(item.choices) || item.choices.length < 3 || item.choices.length > 4) throw new Error("invalid choices");
      if (!item.choices.includes(item.answer)) throw new Error("invalid answer");
    });
  }

  function pickDailyProblems(problems, grade, subject) {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const shuffled = seededShuffle(problems, hashString(`${dateKey}:${grade}:${subject}`));
    return shuffled.slice(0, Math.min(DAILY_COUNT, shuffled.length));
  }

  function seededShuffle(items, seed) {
    const arr = items.slice();
    let value = seed || 1;
    for (let i = arr.length - 1; i > 0; i -= 1) {
      value = (value * 1664525 + 1013904223) >>> 0;
      const j = value % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function showQuestion() {
    setView("question");
    state.selected = null;
    state.checked = false;
    const problem = state.queue[state.currentIndex];
    const node = panel();
    const total = state.queue.length;
    const progress = Math.round((state.currentIndex / total) * 100);
    node.innerHTML = `
      <div class="progress-row">
        <span class="badge">${state.grade}年生</span>
        <span class="badge">${state.subject}</span>
        ${state.reviewMode ? '<span class="badge">復習</span>' : ""}
        <div class="meter" aria-label="進み具合"><span style="width:${progress}%"></span></div>
        <span class="mini">${state.currentIndex + 1} / ${total}</span>
      </div>
      <div class="question-layout">
        <div>
          <p class="question-text">${escapeHtml(problem.question)}</p>
          <div class="choices" role="radiogroup" aria-label="答えを選ぶ"></div>
          <div class="action-row">
            <button class="button" type="button" data-check disabled>答えあわせ</button>
            <button class="button secondary" type="button" data-hint>ヒント</button>
          </div>
          <div class="feedback" data-feedback hidden></div>
        </div>
        <div class="visual-box">${renderVisual(problem.visualType, problem.visualData)}</div>
      </div>
    `;
    const choices = node.querySelector(".choices");
    problem.choices.forEach((choice, index) => {
      const label = document.createElement("label");
      label.className = "choice";
      label.innerHTML = `<input type="radio" name="choice" value="${index}"><span>${escapeHtml(choice)}</span>`;
      label.addEventListener("click", () => {
        if (state.checked) return;
        state.selected = choice;
        node.querySelectorAll(".choice").forEach((el) => el.classList.remove("selected"));
        label.classList.add("selected");
        node.querySelector("[data-check]").disabled = false;
      });
      choices.appendChild(label);
    });
    node.querySelector("[data-check]").addEventListener("click", () => checkAnswer(node, problem));
    node.querySelector("[data-hint]").addEventListener("click", () => {
      const feedback = node.querySelector("[data-feedback]");
      feedback.hidden = false;
      feedback.className = "feedback";
      feedback.textContent = `ヒント: ${problem.hint}`;
    });
  }

  function checkAnswer(node, problem) {
    if (state.checked || state.selected == null) return;
    state.checked = true;
    const correct = state.selected === problem.answer;
    state.answers.push({ id: problem.id, correct, selected: state.selected, problem });
    node.querySelectorAll(".choice").forEach((el) => {
      const text = el.querySelector("span").textContent;
      if (text === problem.answer) el.classList.add("correct");
      if (text === state.selected && !correct) el.classList.add("incorrect");
      el.querySelector("input").disabled = true;
    });
    const feedback = node.querySelector("[data-feedback]");
    feedback.hidden = false;
    feedback.className = `feedback ${correct ? "good" : "bad"}`;
    feedback.innerHTML = `<strong>${correct ? "正解です。" : "もう一歩です。"}</strong><br>${escapeHtml(problem.explanation)}`;
    const row = node.querySelector(".action-row");
    row.innerHTML = `<button class="button" type="button" data-next>${state.currentIndex + 1 === state.queue.length ? "結果を見る" : "次の問題"}</button>`;
    row.querySelector("[data-next]").addEventListener("click", nextQuestion);
  }

  function nextQuestion() {
    state.currentIndex += 1;
    if (state.currentIndex < state.queue.length) {
      showQuestion();
      return;
    }
    showResult();
  }

  function showResult() {
    setView("result");
    const score = state.answers.filter((item) => item.correct).length;
    const total = state.answers.length;
    const rate = total ? Math.round((score / total) * 100) : 0;
    if (!state.reviewMode) saveHistory({ grade: state.grade, subject: state.subject, score, total, rate });
    const wrong = state.answers.filter((item) => !item.correct).map((item) => item.problem);
    const node = panel();
    node.innerHTML = `
      <h2>${state.reviewMode ? "復習の結果" : "今日の結果"}</h2>
      <div class="score">
        <div class="stat"><span>点数</span><b>${score}/${total}</b></div>
        <div class="stat"><span>正答率</span><b>${rate}%</b></div>
        <div class="stat"><span>教科</span><b>${state.subject}</b></div>
      </div>
      <div class="action-row" style="margin-top:16px">
        ${wrong.length ? '<button class="button warning" type="button" data-review>まちがえた問題を復習</button>' : '<span class="badge">全問正解です</span>'}
        <button class="button secondary" type="button" data-subject>教科をえらぶ</button>
        <button class="button secondary" type="button" data-home>ホーム</button>
      </div>
    `;
    const reviewButton = node.querySelector("[data-review]");
    if (reviewButton) {
      reviewButton.addEventListener("click", () => {
        state.queue = wrong;
        state.currentIndex = 0;
        state.answers = [];
        state.reviewMode = true;
        showQuestion();
      });
    }
    node.querySelector("[data-subject]").addEventListener("click", showSubjectSelect);
    node.querySelector("[data-home]").addEventListener("click", showHome);
  }

  function saveHistory(entry) {
    const history = getHistory();
    history.unshift({
      date: new Date().toLocaleDateString("ja-JP"),
      grade: entry.grade,
      subject: entry.subject,
      score: entry.score,
      total: entry.total,
      rate: entry.rate
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60)));
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function showHistory() {
    setView("history");
    const history = getHistory();
    const node = panel();
    const bySubject = SUBJECTS.map((subject) => {
      const items = history.filter((item) => item.subject === subject);
      if (!items.length) return null;
      const rate = Math.round(items.reduce((sum, item) => sum + item.rate, 0) / items.length);
      return `<div class="stat"><span>${subject}</span><b>${rate}%</b></div>`;
    }).filter(Boolean).join("");
    node.innerHTML = `
      <h2>学習履歴</h2>
      <div class="score">${bySubject || '<div class="stat"><span>教科別正答率</span><b>--</b></div>'}</div>
      <div class="history-list">
        ${history.length ? history.map((item) => `
          <div class="history-item">
            <div><strong>${item.date} ${item.grade}年生 ${item.subject}</strong><div class="mini">点数 ${item.score}/${item.total}</div></div>
            <span class="badge">${item.rate}%</span>
          </div>
        `).join("") : '<p class="mini">まだ学習履歴はありません。</p>'}
      </div>
    `;
  }

  function showError(message) {
    setView("error");
    panel().innerHTML = `<h2>読み込みエラー</h2><p>${escapeHtml(message)}</p><button class="button" type="button" data-home>ホーム</button>`;
    app.querySelector("[data-home]").addEventListener("click", showHome);
  }

  function renderVisual(type, data) {
    switch (type) {
      case "countingObjects": return renderCounting(data);
      case "numberLine": return renderNumberLine(data);
      case "clock": return renderClock(data);
      case "shape": return renderShape(data);
      case "barGraph": return renderBarGraph(data);
      case "table": return renderTable(data);
      case "map": return renderMap(data);
      case "scienceDiagram": return renderScience(data);
      case "englishPictureCard": return renderEnglishCard(data);
      default: return `<p class="mini">図を見ずに考える問題です。</p>`;
    }
  }

  function renderCounting(data) {
    const icon = escapeHtml(data.icon || "●");
    const count = Number(data.count || 0);
    return `<div class="object-grid" aria-label="${count}こ">${Array.from({ length: count }, () => `<span>${icon}</span>`).join("")}</div>`;
  }

  function renderNumberLine(data) {
    const min = data.min ?? 0;
    const max = data.max ?? 10;
    const points = data.points || [];
    const range = max - min;
    const step = data.tickStep || (range <= 12 ? 1 : range <= 60 ? 10 : 20);
    const ticks = [];
    for (let n = min; n <= max; n += step) ticks.push(n);
    if (!ticks.includes(max)) ticks.push(max);
    const formatTick = (n) => data.display === "tenths" ? (n / 10).toFixed(1).replace(".0", "") : String(n);
    const tickSvg = ticks.map((n) => {
      const x = 40 + ((n - min) / (max - min)) * 420;
      return `<line x1="${x}" y1="70" x2="${x}" y2="82" stroke="#18324a" stroke-width="2"/><text x="${x}" y="104" text-anchor="middle" font-size="18">${formatTick(n)}</text>`;
    }).join("");
    const pointSvg = points.map((p) => {
      const x = 40 + ((p.value - min) / (max - min)) * 420;
      return `<circle cx="${x}" cy="70" r="10" fill="${p.color || "#ff7aa8"}"/><text x="${x}" y="48" text-anchor="middle" font-size="18" font-weight="700">${escapeHtml(p.label || "")}</text>`;
    }).join("");
    return `<svg viewBox="0 0 500 130" role="img" aria-label="数直線"><line x1="40" y1="70" x2="460" y2="70" stroke="#18324a" stroke-width="4"/>${tickSvg}${pointSvg}</svg>`;
  }

  function renderClock(data) {
    const hour = data.hour || 0;
    const minute = data.minute || 0;
    const hAngle = ((hour % 12) * 30) + minute * .5;
    const mAngle = minute * 6;
    return `<svg viewBox="0 0 240 240" role="img" aria-label="時計">
      <circle cx="120" cy="120" r="96" fill="#fff" stroke="#2f80ed" stroke-width="8"/>
      ${[...Array(12)].map((_, i) => {
        const a = (i + 1) * 30 * Math.PI / 180;
        const x = 120 + Math.sin(a) * 72;
        const y = 120 - Math.cos(a) * 72 + 7;
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="18" font-weight="700">${i + 1}</text>`;
      }).join("")}
      <line x1="120" y1="120" x2="120" y2="62" stroke="#18324a" stroke-width="7" stroke-linecap="round" transform="rotate(${mAngle} 120 120)"/>
      <line x1="120" y1="120" x2="120" y2="78" stroke="#ff7aa8" stroke-width="9" stroke-linecap="round" transform="rotate(${hAngle} 120 120)"/>
      <circle cx="120" cy="120" r="7" fill="#18324a"/>
    </svg>`;
  }

  function renderShape(data) {
    const shapes = data.shapes || [];
    return `<svg viewBox="0 0 420 260" role="img" aria-label="図形">${shapes.map((shape, i) => {
      const color = shape.color || ["#ffd166", "#36c6a5", "#ff7aa8", "#2f80ed"][i % 4];
      if (shape.kind === "triangle") return `<polygon points="${shape.points || "90,40 40,180 150,180"}" fill="${color}" stroke="#18324a" stroke-width="3"/>`;
      if (shape.kind === "circle") return `<circle cx="${shape.cx || 210}" cy="${shape.cy || 110}" r="${shape.r || 50}" fill="${color}" stroke="#18324a" stroke-width="3"/>`;
      if (shape.kind === "rect") return `<rect x="${shape.x || 260}" y="${shape.y || 55}" width="${shape.w || 90}" height="${shape.h || 90}" rx="6" fill="${color}" stroke="#18324a" stroke-width="3"/>`;
      return `<text x="20" y="${40 + i * 34}" font-size="24">${escapeHtml(shape.label || "")}</text>`;
    }).join("")}${data.label ? `<text x="210" y="238" text-anchor="middle" font-size="20" font-weight="700">${escapeHtml(data.label)}</text>` : ""}</svg>`;
  }

  function renderBarGraph(data) {
    const labels = data.labels || [];
    const values = data.values || [];
    const max = Math.max(...values, 1);
    return `<svg viewBox="0 0 500 300" role="img" aria-label="棒グラフ">
      <line x1="58" y1="240" x2="460" y2="240" stroke="#18324a" stroke-width="3"/>
      <line x1="58" y1="30" x2="58" y2="240" stroke="#18324a" stroke-width="3"/>
      ${values.map((v, i) => {
        const h = (v / max) * 170;
        const x = 88 + i * (360 / values.length);
        return `<rect x="${x}" y="${240 - h}" width="48" height="${h}" fill="${["#2f80ed", "#36c6a5", "#ffd166", "#ff7aa8"][i % 4]}" rx="5"/><text x="${x + 24}" y="${232 - h}" text-anchor="middle" font-size="18" font-weight="700">${v}</text><text x="${x + 24}" y="270" text-anchor="middle" font-size="17">${escapeHtml(labels[i] || "")}</text>`;
      }).join("")}
    </svg>`;
  }

  function renderTable(data) {
    const headers = data.headers || [];
    const rows = data.rows || [];
    const width = Math.max(headers.length, 1) * 130;
    const height = (rows.length + 1) * 50 + 20;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="表">
      ${headers.map((h, i) => `<rect x="${i * 130}" y="0" width="130" height="50" fill="#eaf4ff" stroke="#18324a"/><text x="${i * 130 + 65}" y="32" text-anchor="middle" font-size="18" font-weight="700">${escapeHtml(h)}</text>`).join("")}
      ${rows.map((row, r) => row.map((cell, c) => `<rect x="${c * 130}" y="${50 + r * 50}" width="130" height="50" fill="#fff" stroke="#18324a"/><text x="${c * 130 + 65}" y="${82 + r * 50}" text-anchor="middle" font-size="18">${escapeHtml(String(cell))}</text>`).join("")).join("")}
    </svg>`;
  }

  function renderMap(data) {
    const spots = data.spots || [];
    return `<svg viewBox="0 0 440 280" role="img" aria-label="地図">
      <rect x="18" y="22" width="404" height="230" rx="8" fill="#eaf7ff" stroke="#2f80ed" stroke-width="4"/>
      <path d="M70 210 C130 120, 185 218, 250 126 S350 76, 386 170" fill="none" stroke="#36c6a5" stroke-width="18" stroke-linecap="round"/>
      <line x1="70" y1="55" x2="370" y2="55" stroke="#ffd166" stroke-width="14" stroke-linecap="round"/>
      ${spots.map((s) => `<circle cx="${s.x}" cy="${s.y}" r="18" fill="${s.color || "#ff7aa8"}" stroke="#18324a" stroke-width="3"/><text x="${s.x}" y="${s.y + 44}" text-anchor="middle" font-size="16" font-weight="700">${escapeHtml(s.label)}</text>`).join("")}
    </svg>`;
  }

  function renderScience(data) {
    const kind = data.kind || "plant";
    if (kind === "plant") {
      return `<svg viewBox="0 0 320 300" role="img" aria-label="植物の図">
        <line x1="160" y1="112" x2="160" y2="232" stroke="#36a96b" stroke-width="12"/>
        <ellipse cx="115" cy="160" rx="52" ry="24" fill="#64c97b" transform="rotate(-28 115 160)"/>
        <ellipse cx="205" cy="145" rx="52" ry="24" fill="#64c97b" transform="rotate(28 205 145)"/>
        <circle cx="160" cy="88" r="36" fill="#ffd166" stroke="#18324a" stroke-width="3"/>
        <path d="M108 235 C130 260, 152 252, 160 232 C170 255, 198 262, 220 235" fill="none" stroke="#8b6b43" stroke-width="8" stroke-linecap="round"/>
        <text x="160" y="285" text-anchor="middle" font-size="18" font-weight="700">${escapeHtml(data.label || "植物")}</text>
      </svg>`;
    }
    return `<svg viewBox="0 0 340 280" role="img" aria-label="理科の図">
      <circle cx="90" cy="130" r="45" fill="#ffd166" stroke="#18324a" stroke-width="3"/>
      <rect x="170" y="80" width="88" height="120" rx="8" fill="#eaf4ff" stroke="#18324a" stroke-width="3"/>
      <path d="M214 80 L214 40" stroke="#18324a" stroke-width="4"/>
      <text x="170" y="245" font-size="18" font-weight="700">${escapeHtml(data.label || "観察")}</text>
    </svg>`;
  }

  function renderEnglishCard(data) {
    return `<svg viewBox="0 0 360 260" role="img" aria-label="英語絵カード">
      <rect x="30" y="20" width="300" height="220" rx="8" fill="#fff" stroke="#2f80ed" stroke-width="5"/>
      <text x="180" y="90" text-anchor="middle" font-size="58">${escapeHtml(data.icon || "★")}</text>
      <text x="180" y="168" text-anchor="middle" font-size="34" font-weight="800" fill="#18324a">${escapeHtml(data.word || "")}</text>
      <text x="180" y="205" text-anchor="middle" font-size="18" fill="#60748a">${escapeHtml(data.label || "")}</text>
    </svg>`;
  }

  function heroSvg() {
    return `<svg viewBox="0 0 520 360" role="img" aria-label="学習イラスト">
      <rect x="46" y="52" width="428" height="250" rx="16" fill="#ffffff" stroke="#2f80ed" stroke-width="6"/>
      <rect x="78" y="86" width="160" height="38" rx="8" fill="#eaf4ff"/>
      <rect x="78" y="144" width="92" height="92" rx="8" fill="#ffd166"/>
      <circle cx="300" cy="188" r="48" fill="#36c6a5"/>
      <path d="M360 226 L420 104 L470 226 Z" fill="#ff7aa8"/>
      <line x1="90" y1="270" x2="430" y2="270" stroke="#18324a" stroke-width="5" stroke-linecap="round"/>
      <text x="156" y="210" text-anchor="middle" font-size="60" font-weight="900" fill="#18324a">3</text>
      <text x="300" y="205" text-anchor="middle" font-size="52" font-weight="900" fill="#ffffff">A</text>
    </svg>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
