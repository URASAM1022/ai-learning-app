(function () {
  "use strict";

  const GRADES = [1, 4];
  const POINTS = 5;
  const HISTORY_KEY = "dailyAiStudy.preview.history.v2";
  const app = document.querySelector("#app");
  const state = { grade: null, problems: [], reviewMode: false };

  document.querySelector("#homeButton").addEventListener("click", showHome);
  document.querySelector("#historyButton").addEventListener("click", showHistory);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  showHome();

  function showHome() {
    app.innerHTML = "";
    const node = panel("hero");
    node.innerHTML = `
      <div>
        <h2>1年生と4年生だけを、完成レベルで確認。</h2>
        <p>今日の20問を1ページで解きます。選ぶ問題、書く問題、図や表を見て答える問題を組み合わせ、100点満点で採点します。</p>
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
    app.innerHTML = "";
    const node = panel();
    node.innerHTML = `<h2>学年をえらんでください</h2><div class="grid"></div>`;
    const grid = node.querySelector(".grid");
    GRADES.forEach((grade) => {
      const button = document.createElement("button");
      button.className = "button tile";
      button.type = "button";
      button.innerHTML = `<strong>${grade}年生</strong><span>今日の20問</span>`;
      button.addEventListener("click", () => startQuiz(grade));
      grid.appendChild(button);
    });
  }

  async function startQuiz(grade, reviewProblems) {
    state.grade = grade;
    state.reviewMode = Boolean(reviewProblems);
    app.innerHTML = "";
    panel().innerHTML = `<h2>問題を用意しています</h2><p class="mini">少しだけ待ってください。</p>`;
    try {
      const all = reviewProblems || await loadProblems(grade);
      state.problems = reviewProblems ? all : dailyOrder(all, grade);
      showQuiz();
    } catch (error) {
      app.innerHTML = "";
      panel().innerHTML = `<h2>読み込みエラー</h2><p>問題データを読み込めませんでした。</p>`;
    }
  }

  async function loadProblems(grade) {
    const response = await fetch(`./problems/grade${grade}.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error("load failed");
    const data = await response.json();
    validateProblems(data, grade);
    return data;
  }

  function validateProblems(data, grade) {
    const required = ["id", "grade", "subject", "type", "question", "answer", "acceptableAnswers", "explanation", "hint", "visualType", "visualData", "qualityChecked", "copyrightSafe"];
    const ids = new Set();
    data.forEach((item) => {
      required.forEach((key) => {
        if (!(key in item)) throw new Error(`${item.id || "unknown"} missing ${key}`);
      });
      if (item.grade !== grade || ids.has(item.id)) throw new Error("invalid problem");
      ids.add(item.id);
      if (item.type === "choice" && (!Array.isArray(item.choices) || !item.choices.includes(item.answer))) throw new Error("bad choice problem");
      if (!Array.isArray(item.acceptableAnswers) || !item.acceptableAnswers.length) throw new Error("bad answers");
      if (item.qualityChecked !== true || item.copyrightSafe !== true) throw new Error("unchecked problem");
    });
  }

  function dailyOrder(items, grade) {
    const today = new Date();
    const key = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}:${grade}`;
    return seededShuffle(items, hashString(key)).slice(0, 20);
  }

  function showQuiz() {
    app.innerHTML = "";
    const intro = panel();
    intro.innerHTML = `
      <div class="meta-row">
        <span class="badge">${state.grade}年生</span>
        <span class="badge">${state.reviewMode ? "復習" : "今日の20問"}</span>
        <span class="badge">1問${POINTS}点</span>
      </div>
      <h2>${state.reviewMode ? "まちがえた問題だけ復習" : "今日の問題"}</h2>
      <p class="mini">書く問題は、ひらがな・全角半角・スペースのちがいを少し吸収して採点します。採点後に正答例と解説が出ます。</p>
    `;

    const form = document.createElement("form");
    form.className = "quiz-form";
    state.problems.forEach((problem, index) => form.appendChild(questionCard(problem, index)));
    const actions = document.createElement("section");
    actions.className = "panel";
    actions.innerHTML = `<div class="action-row"><button class="button" type="submit">採点する</button><button class="button secondary" type="button" data-home>ホーム</button></div>`;
    form.appendChild(actions);
    form.addEventListener("submit", gradeQuiz);
    actions.querySelector("[data-home]").addEventListener("click", showHome);
    app.appendChild(form);
  }

  function questionCard(problem, index) {
    const card = document.createElement("section");
    card.className = "question-card";
    card.dataset.id = problem.id;
    const answerUi = problem.type === "choice" ? choiceUi(problem) : inputUi(problem);
    card.innerHTML = `
      <div class="question-top">
        <div class="meta-row">
          <span class="badge">Q${index + 1}</span>
          <span class="badge">${problem.subject}</span>
          <span class="badge">${problem.type === "choice" ? "えらぶ" : "書く"}</span>
        </div>
        <span class="mini">${POINTS}点</span>
      </div>
      <div class="question-body">
        <div>
          <p class="question-text">${escapeHtml(problem.question)}</p>
          ${answerUi}
          <p class="mini">ヒント: ${escapeHtml(problem.hint)}</p>
        </div>
        <div class="visual">${renderVisual(problem.visualType, problem.visualData)}</div>
      </div>
      <div class="result-note" data-result></div>
    `;
    return card;
  }

  function choiceUi(problem) {
    return `<div class="choices" role="radiogroup" aria-label="答え">
      ${problem.choices.map((choice, i) => `
        <label class="choice">
          <input type="radio" name="${problem.id}" value="${escapeHtml(choice)}">
          <span>${escapeHtml(choice)}</span>
        </label>
      `).join("")}
    </div>`;
  }

  function inputUi(problem) {
    const placeholder = problem.placeholder || (state.grade === 1 ? "こたえをかく" : "答えを書く");
    if (problem.longAnswer) {
      return `<textarea class="answer-textarea" name="${problem.id}" placeholder="${escapeHtml(placeholder)}" rows="3" autocomplete="off"></textarea>`;
    }
    return `<input class="answer-input" name="${problem.id}" placeholder="${escapeHtml(placeholder)}" autocomplete="off">`;
  }

  function gradeQuiz(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const wrong = [];
    const subjectStats = {};
    let correctCount = 0;

    state.problems.forEach((problem) => {
      const raw = formData.get(problem.id) || "";
      const correct = isCorrect(raw, problem);
      if (correct) correctCount += 1;
      if (!correct) wrong.push(problem);
      const stat = subjectStats[problem.subject] || { correct: 0, total: 0 };
      stat.total += 1;
      if (correct) stat.correct += 1;
      subjectStats[problem.subject] = stat;
      paintResult(problem, raw, correct);
    });

    const score = correctCount * POINTS;
    const total = state.problems.length * POINTS;
    if (!state.reviewMode) saveHistory(score, total, subjectStats);
    showResultSummary(score, total, wrong, subjectStats);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function paintResult(problem, raw, correct) {
    const card = document.querySelector(`[data-id="${problem.id}"]`);
    const result = card.querySelector("[data-result]");
    card.classList.toggle("correct", correct);
    card.classList.toggle("wrong", !correct);
    const displayRaw = String(raw || "").trim() || "未回答";
    result.innerHTML = `
      <div class="score-row">
        <span class="badge ${correct ? "good" : "bad"}">${correct ? "正解" : "確認"}</span>
        <span>あなたの答え: ${escapeHtml(displayRaw)}</span>
      </div>
      <p>正答例: <span class="correct-answer">${escapeHtml(problem.answer)}</span></p>
      <p>${escapeHtml(problem.explanation)}</p>
    `;
  }

  function showResultSummary(score, total, wrong, subjectStats) {
    const old = document.querySelector("[data-summary]");
    if (old) old.remove();
    const rate = Math.round((score / total) * 100);
    const node = document.createElement("section");
    node.className = "panel";
    node.dataset.summary = "true";
    node.innerHTML = `
      <h2>${state.reviewMode ? "復習の結果" : "採点結果"}</h2>
      <div class="score-grid">
        <div class="stat"><span>点数</span><b>${score}/${total}</b></div>
        <div class="stat"><span>正答率</span><b>${rate}%</b></div>
        <div class="stat"><span>まちがい</span><b>${wrong.length}問</b></div>
      </div>
      <h3>教科別</h3>
      <div class="score-grid">${subjectStatHtml(subjectStats)}</div>
      <h3>苦手分析</h3>
      <div class="weak-list">${weakHtml(subjectStats)}</div>
      <div class="action-row" style="margin-top:16px">
        ${wrong.length ? '<button class="button warning" type="button" data-review>まちがえた問題だけ復習</button>' : '<span class="badge good">全問正解</span>'}
        <button class="button secondary" type="button" data-grade>学年をえらぶ</button>
      </div>
    `;
    app.prepend(node);
    const review = node.querySelector("[data-review]");
    if (review) review.addEventListener("click", () => startQuiz(state.grade, wrong));
    node.querySelector("[data-grade]").addEventListener("click", showGradeSelect);
  }

  function subjectStatHtml(stats) {
    return Object.keys(stats).map((subject) => {
      const item = stats[subject];
      return `<div class="stat"><span>${subject}</span><b>${item.correct}/${item.total}</b></div>`;
    }).join("");
  }

  function weakHtml(stats) {
    const weak = Object.keys(stats).map((subject) => ({ subject, rate: stats[subject].correct / stats[subject].total }))
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 2);
    return weak.map((item) => `<div class="history-item"><div><strong>${item.subject}</strong><div class="mini">${weakMessage(item.subject, item.rate)}</div></div><span class="badge">${Math.round(item.rate * 100)}%</span></div>`).join("");
  }

  function weakMessage(subject, rate) {
    if (rate >= .8) return `${subject}はよくできています。次は説明まで言えるか試しましょう。`;
    if (rate >= .5) return `${subject}はあと少しです。まちがえた問題をもう一度見直しましょう。`;
    return `${subject}を重点復習しましょう。ヒントと図を見ながら、答え方を確認します。`;
  }

  function saveHistory(score, total, subjectStats) {
    const history = getHistory();
    history.unshift({
      date: new Date().toLocaleDateString("ja-JP"),
      grade: state.grade,
      score,
      total,
      rate: Math.round((score / total) * 100),
      subjects: subjectStats
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 40)));
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
  }

  function showHistory() {
    app.innerHTML = "";
    const history = getHistory();
    const node = panel();
    node.innerHTML = `
      <h2>学習履歴</h2>
      <div class="history-list">
        ${history.length ? history.map((item) => `
          <div class="history-item">
            <div><strong>${item.date} ${item.grade}年生</strong><div class="mini">点数 ${item.score}/${item.total}</div></div>
            <span class="badge">${item.rate}%</span>
          </div>
        `).join("") : '<p class="mini">まだ学習履歴はありません。</p>'}
      </div>
    `;
  }

  function isCorrect(raw, problem) {
    const answer = normalizeAnswer(raw);
    return problem.acceptableAnswers.some((item) => answer === normalizeAnswer(item));
  }

  function normalizeAnswer(value) {
    return String(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[、。，．・\s]/g, "")
      .replace(/[ゃゅょ]/g, (m) => ({ "ゃ": "や", "ゅ": "ゆ", "ょ": "よ" }[m]))
      .trim();
  }

  function panel(extraClass) {
    const node = document.createElement("section");
    node.className = `panel${extraClass ? ` ${extraClass}` : ""}`;
    app.appendChild(node);
    return node;
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
      default: return `<p class="mini">文字をよく読んで答えましょう。</p>`;
    }
  }

  function renderCounting(data) {
    const icon = escapeHtml(data.icon || "●");
    return `<div class="object-grid" aria-label="${data.count}こ" style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;max-width:360px">${Array.from({ length: Number(data.count || 0) }, () => `<span style="width:42px;height:42px;display:grid;place-items:center;border-radius:50%;background:#fff6d8;border:2px solid #ffd166;font-size:1.45rem">${icon}</span>`).join("")}</div>`;
  }

  function renderNumberLine(data) {
    const min = data.min ?? 0;
    const max = data.max ?? 10;
    const step = data.tickStep || 1;
    const ticks = [];
    for (let n = min; n <= max; n += step) ticks.push(n);
    const label = (n) => data.display === "tenths" ? (n / 10).toFixed(1).replace(".0", "") : String(n);
    return `<svg viewBox="0 0 500 130" role="img" aria-label="数直線">
      <line x1="40" y1="70" x2="460" y2="70" stroke="#18324a" stroke-width="4"/>
      ${ticks.map((n) => {
        const x = 40 + ((n - min) / (max - min)) * 420;
        return `<line x1="${x}" y1="70" x2="${x}" y2="82" stroke="#18324a" stroke-width="2"/><text x="${x}" y="106" text-anchor="middle" font-size="18">${label(n)}</text>`;
      }).join("")}
      ${(data.points || []).map((p) => {
        const x = 40 + ((p.value - min) / (max - min)) * 420;
        return `<circle cx="${x}" cy="70" r="10" fill="${p.color || "#ff7aa8"}"/><text x="${x}" y="45" text-anchor="middle" font-size="18" font-weight="800">${escapeHtml(p.label || "")}</text>`;
      }).join("")}
    </svg>`;
  }

  function renderClock(data) {
    const hour = data.hour || 0;
    const minute = data.minute || 0;
    const hAngle = ((hour % 12) * 30) + minute * .5;
    const mAngle = minute * 6;
    return `<svg viewBox="0 0 240 240" role="img" aria-label="時計">
      <circle cx="120" cy="120" r="96" fill="#fff" stroke="#2f80ed" stroke-width="8"/>
      ${Array.from({ length: 12 }, (_, i) => {
        const a = (i + 1) * 30 * Math.PI / 180;
        const x = 120 + Math.sin(a) * 72;
        const y = 120 - Math.cos(a) * 72 + 7;
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="18" font-weight="800">${i + 1}</text>`;
      }).join("")}
      <line x1="120" y1="120" x2="120" y2="62" stroke="#18324a" stroke-width="7" stroke-linecap="round" transform="rotate(${mAngle} 120 120)"/>
      <line x1="120" y1="120" x2="120" y2="78" stroke="#ff7aa8" stroke-width="9" stroke-linecap="round" transform="rotate(${hAngle} 120 120)"/>
      <circle cx="120" cy="120" r="7" fill="#18324a"/>
    </svg>`;
  }

  function renderShape(data) {
    return `<svg viewBox="0 0 420 260" role="img" aria-label="図形">
      ${(data.shapes || []).map((shape, i) => {
        const color = shape.color || ["#ffd166", "#36c6a5", "#ff7aa8", "#2f80ed"][i % 4];
        if (shape.kind === "triangle") return `<polygon points="${shape.points}" fill="${color}" stroke="#18324a" stroke-width="3"/>`;
        if (shape.kind === "circle") return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="${color}" stroke="#18324a" stroke-width="3"/>`;
        if (shape.kind === "rect") return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="6" fill="${color}" stroke="#18324a" stroke-width="3"/>`;
        return `<text x="${shape.x || 30}" y="${shape.y || 45 + i * 36}" font-size="22" font-weight="800">${escapeHtml(shape.label || "")}</text>`;
      }).join("")}
      ${data.label ? `<text x="210" y="238" text-anchor="middle" font-size="20" font-weight="800">${escapeHtml(data.label)}</text>` : ""}
    </svg>`;
  }

  function renderBarGraph(data) {
    const values = data.values || [];
    const labels = data.labels || [];
    const max = Math.max(...values, 1);
    return `<svg viewBox="0 0 500 300" role="img" aria-label="棒グラフ">
      <line x1="58" y1="240" x2="460" y2="240" stroke="#18324a" stroke-width="3"/>
      <line x1="58" y1="30" x2="58" y2="240" stroke="#18324a" stroke-width="3"/>
      ${values.map((v, i) => {
        const h = (v / max) * 170;
        const x = 86 + i * (360 / Math.max(values.length, 1));
        return `<rect x="${x}" y="${240 - h}" width="50" height="${h}" rx="5" fill="${["#2f80ed", "#36c6a5", "#ffd166", "#ff7aa8"][i % 4]}"/><text x="${x + 25}" y="${232 - h}" text-anchor="middle" font-size="18" font-weight="800">${v}</text><text x="${x + 25}" y="270" text-anchor="middle" font-size="17">${escapeHtml(labels[i] || "")}</text>`;
      }).join("")}
    </svg>`;
  }

  function renderTable(data) {
    const headers = data.headers || [];
    const rows = data.rows || [];
    const width = Math.max(headers.length, 1) * 132;
    const height = (rows.length + 1) * 52 + 12;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="表">
      ${headers.map((h, i) => `<rect x="${i * 132}" y="0" width="132" height="52" fill="#eaf4ff" stroke="#18324a"/><text x="${i * 132 + 66}" y="33" text-anchor="middle" font-size="17" font-weight="800">${escapeHtml(h)}</text>`).join("")}
      ${rows.map((row, r) => row.map((cell, c) => `<rect x="${c * 132}" y="${52 + r * 52}" width="132" height="52" fill="#fff" stroke="#18324a"/><text x="${c * 132 + 66}" y="${85 + r * 52}" text-anchor="middle" font-size="17">${escapeHtml(String(cell))}</text>`).join("")).join("")}
    </svg>`;
  }

  function renderMap(data) {
    return `<svg viewBox="0 0 440 280" role="img" aria-label="地図">
      <rect x="18" y="22" width="404" height="230" rx="8" fill="#eaf7ff" stroke="#2f80ed" stroke-width="4"/>
      <path d="M70 210 C130 120, 185 218, 250 126 S350 76, 386 170" fill="none" stroke="#36c6a5" stroke-width="18" stroke-linecap="round"/>
      <line x1="70" y1="55" x2="370" y2="55" stroke="#ffd166" stroke-width="14" stroke-linecap="round"/>
      ${(data.spots || []).map((s) => `<circle cx="${s.x}" cy="${s.y}" r="18" fill="${s.color || "#ff7aa8"}" stroke="#18324a" stroke-width="3"/><text x="${s.x}" y="${s.y + 44}" text-anchor="middle" font-size="16" font-weight="800">${escapeHtml(s.label)}</text>`).join("")}
    </svg>`;
  }

  function renderScience(data) {
    if (data.kind === "water") {
      return `<svg viewBox="0 0 340 260" role="img" aria-label="水の変化"><rect x="70" y="70" width="80" height="92" rx="8" fill="#d9f0ff" stroke="#18324a" stroke-width="3"/><path d="M190 160 C210 110 240 95 260 55" fill="none" stroke="#8cc7ff" stroke-width="10" stroke-linecap="round"/><text x="110" y="202" text-anchor="middle" font-size="18" font-weight="800">水</text><text x="250" y="202" text-anchor="middle" font-size="18" font-weight="800">水蒸気</text></svg>`;
    }
    return `<svg viewBox="0 0 320 300" role="img" aria-label="観察図">
      <line x1="160" y1="112" x2="160" y2="232" stroke="#36a96b" stroke-width="12"/>
      <ellipse cx="115" cy="160" rx="52" ry="24" fill="#64c97b" transform="rotate(-28 115 160)"/>
      <ellipse cx="205" cy="145" rx="52" ry="24" fill="#64c97b" transform="rotate(28 205 145)"/>
      <circle cx="160" cy="88" r="36" fill="#ffd166" stroke="#18324a" stroke-width="3"/>
      <path d="M108 235 C130 260, 152 252, 160 232 C170 255, 198 262, 220 235" fill="none" stroke="#8b6b43" stroke-width="8" stroke-linecap="round"/>
      <text x="160" y="285" text-anchor="middle" font-size="18" font-weight="800">${escapeHtml(data.label || "観察")}</text>
    </svg>`;
  }

  function renderEnglishCard(data) {
    return `<svg viewBox="0 0 360 260" role="img" aria-label="英語カード">
      <rect x="30" y="20" width="300" height="220" rx="8" fill="#fff" stroke="#2f80ed" stroke-width="5"/>
      <text x="180" y="92" text-anchor="middle" font-size="58">${escapeHtml(data.icon || "★")}</text>
      <text x="180" y="168" text-anchor="middle" font-size="33" font-weight="900" fill="#18324a">${escapeHtml(data.word || "")}</text>
      <text x="180" y="205" text-anchor="middle" font-size="18" fill="#60748a">${escapeHtml(data.label || "")}</text>
    </svg>`;
  }

  function heroSvg() {
    return `<svg viewBox="0 0 520 360" role="img" aria-label="学習イラスト"><rect x="46" y="52" width="428" height="250" rx="16" fill="#fff" stroke="#2f80ed" stroke-width="6"/><rect x="78" y="86" width="160" height="38" rx="8" fill="#eaf4ff"/><rect x="78" y="144" width="92" height="92" rx="8" fill="#ffd166"/><circle cx="300" cy="188" r="48" fill="#36c6a5"/><path d="M360 226 L420 104 L470 226 Z" fill="#ff7aa8"/><line x1="90" y1="270" x2="430" y2="270" stroke="#18324a" stroke-width="5" stroke-linecap="round"/><text x="156" y="210" text-anchor="middle" font-size="60" font-weight="900" fill="#18324a">1</text><text x="300" y="205" text-anchor="middle" font-size="52" font-weight="900" fill="#fff">4</text></svg>`;
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
})();
