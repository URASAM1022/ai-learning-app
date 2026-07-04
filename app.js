(function () {
  "use strict";

  const GRADES = [1, 4];
  const SUBJECT_MODES = ["国語", "算数", "ミックス"];
  const POINTS = 5;
  const QUESTIONS_PER_TEST = 20;
  const HISTORY_KEY = "dailyAiStudy.kokugoMath.history.v3";
  const app = document.querySelector("#app");
  const state = { grade: null, subjectMode: null, problems: [], reviewMode: false };

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
        <h2>国語と算数だけを、完成レベルで。</h2>
        <p>1年生と4年生にしぼった確認版です。国語だけ、算数だけ、ミックスを選び、毎回20問を100点満点で採点します。</p>
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
      button.innerHTML = `<strong>${grade}年生</strong><span>国語・算数 100問ずつ</span>`;
      button.addEventListener("click", () => {
        state.grade = grade;
        showSubjectModeSelect();
      });
      grid.appendChild(button);
    });
  }

  function showSubjectModeSelect() {
    app.innerHTML = "";
    const node = panel();
    node.innerHTML = `
      <div class="meta-row"><span class="badge">${state.grade}年生</span></div>
      <h2>テストをえらんでください</h2>
      <div class="grid"></div>
    `;
    const grid = node.querySelector(".grid");
    SUBJECT_MODES.forEach((mode) => {
      const button = document.createElement("button");
      button.className = "button tile";
      button.type = "button";
      const sub = mode === "ミックス" ? "国語10問 + 算数10問" : `${mode}から20問`;
      button.innerHTML = `<strong>${mode}</strong><span>${sub}</span>`;
      button.addEventListener("click", () => startQuiz(state.grade, mode));
      grid.appendChild(button);
    });
  }

  function startQuiz(grade, subjectMode, reviewProblems) {
    state.grade = grade;
    state.subjectMode = subjectMode;
    state.reviewMode = Boolean(reviewProblems);
    state.problems = reviewProblems ? reviewProblems : pickProblems(getProblemBank(grade), grade, subjectMode);
    showQuiz();
  }

  function pickProblems(bank, grade, subjectMode) {
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}:${grade}:${subjectMode}`;
    if (subjectMode === "ミックス") {
      const japanese = seededShuffle(bank.filter((p) => p.subject === "国語"), hashString(`${dateKey}:ja`)).slice(0, 10);
      const math = seededShuffle(bank.filter((p) => p.subject === "算数"), hashString(`${dateKey}:math`)).slice(0, 10);
      return seededShuffle(japanese.concat(math), hashString(`${dateKey}:mix`));
    }
    return seededShuffle(bank.filter((p) => p.subject === subjectMode), hashString(dateKey)).slice(0, QUESTIONS_PER_TEST);
  }

  function showQuiz() {
    app.innerHTML = "";
    const intro = panel();
    intro.innerHTML = `
      <div class="meta-row">
        <span class="badge">${state.grade}年生</span>
        <span class="badge">${state.subjectMode}</span>
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
    actions.innerHTML = `<div class="action-row"><button class="button" type="submit">採点する</button><button class="button secondary" type="button" data-select>テストをえらぶ</button></div>`;
    form.appendChild(actions);
    form.addEventListener("submit", gradeQuiz);
    actions.querySelector("[data-select]").addEventListener("click", showSubjectModeSelect);
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
      ${problem.choices.map((choice) => `
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
        <button class="button secondary" type="button" data-select>テストをえらぶ</button>
      </div>
    `;
    app.prepend(node);
    const review = node.querySelector("[data-review]");
    if (review) review.addEventListener("click", () => startQuiz(state.grade, state.subjectMode, wrong));
    node.querySelector("[data-select]").addEventListener("click", showSubjectModeSelect);
  }

  function subjectStatHtml(stats) {
    return Object.keys(stats).map((subject) => {
      const item = stats[subject];
      return `<div class="stat"><span>${subject}</span><b>${item.correct}/${item.total}</b></div>`;
    }).join("");
  }

  function weakHtml(stats) {
    const weak = Object.keys(stats).map((subject) => ({ subject, rate: stats[subject].correct / stats[subject].total }))
      .sort((a, b) => a.rate - b.rate);
    return weak.map((item) => `<div class="history-item"><div><strong>${item.subject}</strong><div class="mini">${weakMessage(item.subject, item.rate)}</div></div><span class="badge">${Math.round(item.rate * 100)}%</span></div>`).join("");
  }

  function weakMessage(subject, rate) {
    if (rate >= .8) return `${subject}はよくできています。次は説明まで言えるか試しましょう。`;
    if (rate >= .5) return `${subject}はあと少しです。まちがえた問題をもう一度見直しましょう。`;
    return `${subject}を重点復習しましょう。ヒントと図を見ながら答え方を確認します。`;
  }

  function saveHistory(score, total, subjectStats) {
    const history = getHistory();
    history.unshift({
      date: new Date().toLocaleDateString("ja-JP"),
      grade: state.grade,
      subjectMode: state.subjectMode,
      score,
      total,
      rate: Math.round((score / total) * 100),
      subjects: subjectStats
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 60)));
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
            <div><strong>${item.date} ${item.grade}年生 ${item.subjectMode || ""}</strong><div class="mini">点数 ${item.score}/${item.total}</div></div>
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

  function getProblemBank(grade) {
    const bank = grade === 1 ? grade1Bank() : grade4Bank();
    validateBank(bank, grade);
    return bank;
  }

  function validateBank(bank, grade) {
    const ids = new Set();
    const counts = { "国語": 0, "算数": 0 };
    bank.forEach((p) => {
      if (p.grade !== grade || ids.has(p.id)) throw new Error("problem bank error");
      ids.add(p.id);
      counts[p.subject] += 1;
      if (!p.answer || !Array.isArray(p.acceptableAnswers) || !p.acceptableAnswers.length) throw new Error(`answer error ${p.id}`);
      if (p.type === "choice" && (!Array.isArray(p.choices) || !p.choices.includes(p.answer))) throw new Error(`choice error ${p.id}`);
    });
    if (counts["国語"] !== 50 || counts["算数"] !== 50) throw new Error("problem count error");
  }

  function makeProblem(id, grade, subject, type, question, answer, acceptableAnswers, explanation, hint, visualType, visualData, extra) {
    return Object.assign({
      id, grade, subject, type, question, answer, acceptableAnswers,
      explanation, hint, visualType, visualData,
      qualityChecked: true, copyrightSafe: true
    }, extra || {});
  }

  function grade1Bank() {
    const ja = [
      ...[
        ["はな","🌸","さいしょのおとは「は」です。"],["ねこ","🐱","にゃあとないています。"],["うみ","🌊","なみがよせるところです。"],["やま","⛰️","たかくもり上がったところです。"],["つき","🌙","よるのそらに見えます。"],["いぬ","🐶","わんとなくどうぶつです。"],["あめ","☔","そらから水がおちます。"],["くも","☁️","そらにうかびます。"],["ほし","⭐","よるにきらきら見えます。"],["もも","🍑","あまいくだものです。"]
      ].map((x, i) => makeProblem(`g1-ja-word-${i + 1}`, 1, "国語", "input", `えをみて、ことばをひらがなでかきましょう。`, x[0], [x[0]], `えは「${x[0]}」です。ひらがなでていねいにかきます。`, x[2], "englishPictureCard", { icon: x[1], word: "?", label: "なまえをかく" })),
      ...[
        ["さくら","さ"],["とけい","と"],["からす","か"],["みかん","み"],["すいか","す"],["ひこうき","ひ"],["えんぴつ","え"],["おにぎり","お"],["かえる","か"],["たいこ","た"]
      ].map((x, i) => makeProblem(`g1-ja-first-${i + 1}`, 1, "国語", "choice", `「${x[0]}」のさいしょのおとはどれですか。`, x[1], [x[1]], `「${x[0]}」は、さいしょに「${x[1]}」とよみます。`, `ゆっくり「${x[0]}」とよみましょう。`, "englishPictureCard", { icon: ["🌸","⏰","🐦","🍊","🍉","✈️","✏️","🍙","🐸","🥁"][i], word: x[0], label: "さいしょのおと" }, { choices: [x[1], kanaShift(x[1], 1), kanaShift(x[1], 2)] })),
      ...[
        ["あし","し"],["いす","す"],["かさ","さ"],["つくえ","え"],["はっぱ","ぱ"],["しま","ま"],["そら","ら"],["ふね","ね"],["こま","ま"],["ゆき","き"]
      ].map((x, i) => makeProblem(`g1-ja-last-${i + 1}`, 1, "国語", "choice", `「${x[0]}」のさいごのおとはどれですか。`, x[1], [x[1]], `「${x[0]}」のさいごは「${x[1]}」です。`, `ことばをおとにわけてよみましょう。`, "englishPictureCard", { icon: ["🦶","🪑","☂️","📘","🍃","🏝️","☀️","⛵","🌀","❄️"][i], word: x[0], label: "さいごのおと" }, { choices: [x[1], kanaShift(x[1], 3), kanaShift(x[1], 4)] })),
      ...[
        ["は し", "はし"],["と り", "とり"],["く つ", "くつ"],["み ず", "みず"],["か ぎ", "かぎ"],["や ね", "やね"],["ふ く", "ふく"],["た こ", "たこ"],["な し", "なし"],["ま ど", "まど"]
      ].map((x, i) => makeProblem(`g1-ja-join-${i + 1}`, 1, "国語", "input", `もじをつなげて、ことばをかきましょう。「${x[0]}」`, x[1], [x[1]], `「${x[0]}」をつなげると「${x[1]}」になります。`, "あいだをあけずにかきます。", "table", { headers: ["もじ", "ことば"], rows: [[x[0], "?"]] })),
      ...[
        ["わたし（　）ほんをよむ。","は","だれがするかをあらわすときは「は」をつかいます。"],["ねこ（　）ねる。","が","ねこがどうするかをあらわしています。"],["りんご（　）たべる。","を","たべるものをあらわすときは「を」です。"],["がっこう（　）いく。","へ","行くところをあらわすときは「へ」をつかいます。"],["ともだち（　）あそぶ。","と","いっしょにする人をあらわすときは「と」です。"],["つくえ（　）うえ。","の","つくえと上をつなぐことばです。"],["あめ（　）ふる。","が","何がふるのかをあらわします。"],["みず（　）のむ。","を","のむものをあらわします。"],["いえ（　）かえる。","へ","むかうところをあらわします。"],["はな（　）さく。","が","何がさくのかをあらわします。"]
      ].map((x, i) => makeProblem(`g1-ja-particle-${i + 1}`, 1, "国語", i % 2 ? "input" : "choice", `${x[0]}（　）に入るひらがなをかきましょう。`, x[1], [x[1]], x[2], "文をこえに出してよみましょう。", "table", { headers: ["文", "入ることば"], rows: [[x[0], "?"]] }, i % 2 ? {} : { choices: [x[1], "を", "に"].filter((v, idx, arr) => arr.indexOf(v) === idx) }))
    ];

    const math = [
      ...[
        ["🍎",6,"りんご"],["🍊",8,"みかん"],["⭐",7,"ほし"],["🌼",9,"はな"],["🍓",5,"いちご"],["🟡",10,"まる"],["🍙",4,"おにぎり"],["🐟",6,"さかな"],["🎈",3,"ふうせん"],["🧁",8,"ケーキ"]
      ].map((x, i) => makeProblem(`g1-ma-count-${i + 1}`, 1, "算数", "input", `${x[2]}は、ぜんぶでなんこですか。すうじでかきましょう。`, String(x[1]), [String(x[1]), `${x[1]}こ`], `${x[2]}をひとつずつかぞえると、${x[1]}こです。`, "ゆびでさしながらかぞえましょう。", "countingObjects", { icon: x[0], count: x[1] })),
      ...[
        ["あかいはなが3こ、しろいはなが2こあります。ぜんぶでなんこですか。",5,"🌼"],["えんぴつが4ほん、あとから3ほんふえました。なんほんですか。",7,"✏️"],["あめが2こ、グミが6こあります。ぜんぶでなんこですか。",8,"🍬"],["とりが5わ、あとから1わきました。なんわですか。",6,"🐦"],["つみきが4こ、さらに4こあります。ぜんぶでなんこですか。",8,"🧱"],["バスに3にん、あとから5にんのりました。なんにんですか。",8,"🚌"],["かごにりんごが7こ、さらに2こ入れます。なんこですか。",9,"🍎"],["シールが6まい、もう3まいもらいました。なんまいですか。",9,"⭐"],["どんぐりが5こ、あとから4こ見つけました。なんこですか。",9,"🟤"],["ねこが2ひき、いぬが3びきいます。ぜんぶでなんびきですか。",5,"🐱"]
      ].map((x, i) => makeProblem(`g1-ma-add-${i + 1}`, 1, "算数", "input", x[0], String(x[1]), [String(x[1]), `${x[1]}こ`, `${x[1]}ほん`, `${x[1]}にん`, `${x[1]}まい`, `${x[1]}ひき`], `あわせる問題です。答えは${x[1]}です。`, "はじめの数から、ふえた分をかぞえましょう。", "countingObjects", { icon: x[2], count: x[1] })),
      ...[
        ["クッキーが7こあります。2こたべると、のこりはなんこですか。",5,"🍪"],["ふうせんが6こあります。1こわれると、のこりはなんこですか。",5,"🎈"],["さかなが9ひきいます。4ひきにげました。のこりはなんびきですか。",5,"🐟"],["シールが8まいあります。3まいつかうと、のこりはなんまいですか。",5,"⭐"],["えんぴつが10ぽんあります。6ぽんしまうと、外にあるのはなんぼんですか。",4,"✏️"],["あめが5こあります。2こわけると、のこりはなんこですか。",3,"🍬"],["つみきが8こあります。4こかたづけると、のこりはなんこですか。",4,"🧱"],["どんぐりが9こあります。1こなくすと、のこりはなんこですか。",8,"🟤"]
      ].map((x, i) => makeProblem(`g1-ma-sub-${i + 1}`, 1, "算数", "input", x[0], String(x[1]), [String(x[1]), `${x[1]}こ`, `${x[1]}ひき`, `${x[1]}まい`, `${x[1]}ほん`], `へる問題です。のこりは${x[1]}です。`, "とった分を、ぜんぶの数からへらします。", "countingObjects", { icon: x[2], count: x[1] })),
      ...[
        [0,8,4], [0,10,7], [0,12,9], [2,10,6], [0,15,12], [5,15,11], [0,20,16], [3,13,8]
      ].map((x, i) => makeProblem(`g1-ma-line-${i + 1}`, 1, "算数", "choice", `すうじのせんで、●のところのかずはどれですか。`, String(x[2]), [String(x[2])], `●は${x[2]}のところにあります。`, "左からじゅんにかぞえましょう。", "numberLine", { min: x[0], max: x[1], tickStep: x[1] > 12 ? 2 : 1, points: [{ value: x[2], label: "●" }] }, { choices: [String(x[2]), String(x[2] - 1), String(x[2] + 1)] })),
      ...[
        [3,0,"3じ"],[7,0,"7じ"],[9,0,"9じ"],[2,30,"2じ30ぷん"],[6,30,"6じ30ぷん"],[10,30,"10じ30ぷん"]
      ].map((x, i) => makeProblem(`g1-ma-clock-${i + 1}`, 1, "算数", "input", `とけいはなんじですか。`, x[2], [x[2], x[2].replace("じ","時").replace("ぷん","分")], `みじかいはりと、ながいはりを見ます。答えは${x[2]}です。`, "みじかいはりを先に見ましょう。", "clock", { hour: x[0], minute: x[1] })),
      ...[
        ["まる","circle"],["さんかく","triangle"],["しかく","rect"],["ながしかく","rectwide"],["おなじかたち","same"],["かどが4つ","corners"]
      ].map((x, i) => makeProblem(`g1-ma-shape-${i + 1}`, 1, "算数", i % 2 ? "choice" : "input", `図を見て、${i < 4 ? "かたちのなまえ" : "あてはまることば"}を答えましょう。`, x[0], [x[0]], `図のかたちをよく見ると「${x[0]}」です。`, "かどやまるさを見ましょう。", "shape", shapeVisual1(x[1]), i % 2 ? { choices: [x[0], "まる", "さんかく"].filter((v, idx, arr) => arr.indexOf(v) === idx) } : {})),
      ...[
        ["5は3より大きいです。大きい数を書きましょう。","5"],["2と8では、どちらが小さいですか。","2"],["10のひとつ前の数を書きましょう。","9"],["6のひとつ後の数を書きましょう。","7"],["4、5、6のつぎの数を書きましょう。","7"],["9、8、7のつぎの数を書きましょう。","6"],["10を、5といくつに分けられますか。","5"],["8を、3といくつに分けられますか。","5"]
      ].map((x, i) => makeProblem(`g1-ma-num-${i + 1}`, 1, "算数", "input", x[0], x[1], [x[1]], `数のならびや大きさを考えると、答えは${x[1]}です。`, "数のじゅんばんを思い出しましょう。", "numberLine", { min: 0, max: 10, points: [{ value: Number(x[1]), label: "答え" }] }))
    ];
    return ja.concat(math.slice(0, 50));
  }

  function grade4Bank() {
    const ja = [
      ...[
        ["季節","きせつ","春・夏・秋・冬などの時期を表します。"],["努力","どりょく","目標に向かって力をつくすことです。"],["観察","かんさつ","よく見て調べることです。"],["希望","きぼう","こうなってほしいという願いです。"],["冷静","れいせい","落ち着いている様子です。"],["協力","きょうりょく","力を合わせることです。"],["約束","やくそく","守ると決めたことです。"],["連続","れんぞく","続いていることです。"],["必要","ひつよう","なくてはならないことです。"],["結果","けっか","ものごとの終わりに出たことです。"]
      ].map((x, i) => makeProblem(`g4-ja-read-${i + 1}`, 4, "国語", "input", `「${x[0]}」の読み方をひらがなで書きましょう。`, x[1], [x[1]], `「${x[0]}」は「${x[1]}」と読みます。${x[2]}`, "漢字の形と意味を合わせて考えます。", "englishPictureCard", { icon: "📘", word: x[0], label: "読み方" })),
      ...[
        ["きせつ","季節"],["どりょく","努力"],["かんさつ","観察"],["きぼう","希望"],["れいせい","冷静"],["きょうりょく","協力"],["やくそく","約束"],["ひつよう","必要"]
      ].map((x, i) => makeProblem(`g4-ja-kanji-${i + 1}`, 4, "国語", "input", `「${x[0]}」を漢字で書きましょう。`, x[1], [x[1]], `「${x[0]}」は漢字で「${x[1]}」と書きます。`, "送りがなはありません。", "table", { headers: ["読み", "漢字"], rows: [[x[0], "?"]] })),
      ...[
        ["雨がやんだので、外で遊べる。","理由"],["風は強いけれど、船は進んだ。","反対"],["朝になったら、鳥が鳴き始めた。","時間"],["本を読むために、図書館へ行った。","目的"],["暑いから、窓を開けた。","理由"],["練習したのに、うまくできなかった。","反対"],["夕方になると、町の明かりがついた。","時間"],["発表するために、資料を集めた。","目的"]
      ].map((x, i) => makeProblem(`g4-ja-connect-${i + 1}`, 4, "国語", "choice", `「${x[0]}」のつなぐ言葉は、どの関係を表しますか。`, x[1], [x[1]], `文の前後の関係を見ると「${x[1]}」を表しています。`, "前の文と後ろの文のつながりを考えます。", "table", { headers: ["文", "関係"], rows: [[x[0], "?"]] }, { choices: [x[1], "理由", "反対", "目的", "時間"].filter((v, idx, arr) => arr.indexOf(v) === idx).slice(0, 4) })),
      ...[
        ["根気強い","あきらめずに続ける"],["工夫する","よい方法を考える"],["慎重","よく考えて注意する様子"],["豊か","十分にあり、満ちている様子"],["予想","これからどうなるか考えること"],["整理","分かりやすく整えること"],["比較","二つ以上を比べること"],["役割","その人や物が受け持つ働き"]
      ].map((x, i) => makeProblem(`g4-ja-vocab-${i + 1}`, 4, "国語", i % 2 ? "input" : "choice", `「${x[0]}」の意味として合うものを答えましょう。`, x[1], [x[1]], `「${x[0]}」は「${x[1]}」という意味です。`, "言葉が使われる場面を思い出します。", "englishPictureCard", { icon: "💡", word: x[0], label: "語い" }, i % 2 ? {} : { choices: [x[1], "急いでやめること", "同じ文字を消すこと", "音を小さくすること"] })),
      ...[
        ["朝の公園では、子どもたちが落ち葉を集めていた。管理人さんは、集めた落ち葉を花だんの土にまぜると話した。","落ち葉を土にまぜること","落ち葉は土づくりに役立つからです。"],["川の水位が上がったため、先生は橋を渡らず別の道を選んだ。遠回りでも安全を優先した。","安全を優先したこと","水位が上がった橋は危ないからです。"],["図書委員は、新しい本を紹介するカードを入口に置いた。借りる人が増え、昼休みの図書室は明るくなった。","本の紹介カード","本に興味をもつ人が増えたからです。"],["校庭のすみに小さな芽が出た。クラスは札を立て、水やりの当番を決めて見守った。","芽を見守ったこと","育つ様子を続けて観察するためです。"],["町の祭りでは、古い道具を展示した。お年寄りは道具の使い方を子どもたちに説明した。","古い道具の展示","昔のくらしを伝えるためです。"],["運動会の前、係の人は白線を引き直した。走る場所が分かりやすくなり、練習が進めやすくなった。","白線を引き直したこと","走る場所を分かりやすくするためです。"],["雨の日の登校では、班長が歩く速さをゆっくりにした。みんながすべらないように気を配った。","ゆっくり歩いたこと","安全に歩くためです。"],["給食の残りを減らすため、係は人気の献立を表にまとめた。次の献立を考える資料になった。","人気の献立の表","残りを減らす工夫に使うためです。"]
      ].map((x, i) => makeProblem(`g4-ja-readtext-${i + 1}`, 4, "国語", i % 2 ? "input" : "choice", `次の文章で、大切な行動は何ですか。「${x[0]}」`, x[1], [x[1]], x[2], "だれが何をしたかに注目します。", "table", { headers: ["文章", "大切なこと"], rows: [["本文", "?"]] }, i % 2 ? { longAnswer: true } : { choices: [x[1], "関係のない遊び", "文字の大きさだけ", "天気の名前だけ"] })),
      ...[
        ["文章の中心を短くまとめること","要約"],["理由を示して自分の考えを書く文","意見文"],["実際にあったこととして書かれている内容","事実"],["筆者が伝えたい中心の考え","主張"],["人物の言葉をそのまま書いた部分","会話文"],["文の中で何をしたかを表す言葉","述語"],["文の中でだれがしたかを表す言葉","主語"],["二つのものをくらべること","比較"]
      ].map((x, i) => makeProblem(`g4-ja-term-${i + 1}`, 4, "国語", "input", `${x[0]}を表す言葉を書きましょう。`, x[1], [x[1]], `${x[0]}は「${x[1]}」です。`, "国語の学習で使う言葉を思い出します。", "none", {}))
    ];

    const math = [
      ...[
        ["96÷4",24],["156÷3",52],["208÷8",26],["315÷5",63],["432÷6",72],["728÷7",104],["864÷9",96],["504÷8",63]
      ].map((x, i) => makeProblem(`g4-ma-div-${i + 1}`, 4, "算数", "input", `${x[0]} の答えを書きましょう。`, String(x[1]), [String(x[1])], `${x[0]}=${x[1]}です。わられる数を順に分けて計算します。`, "位ごとにわって、たしかめにかけ算をします。", "table", { headers: ["式", "答え"], rows: [[x[0], "?"]] })),
      ...[
        ["0.7+0.5",1.2],["1.6+2.8",4.4],["5.3-1.7",3.6],["8.0-2.45",5.55],["0.24+0.36",0.6],["3.5×4",14],["2.4×3",7.2],["6.3÷3",2.1]
      ].map((x, i) => makeProblem(`g4-ma-dec-${i + 1}`, 4, "算数", "input", `${x[0]} の答えを小数で書きましょう。`, String(x[1]), [String(x[1])], `小数点の位置に気をつけると、答えは${x[1]}です。`, "小数点をそろえて考えます。", "numberLine", { min: 0, max: 20, tickStep: 5, display: "tenths", points: [{ value: Math.min(20, Math.round(Number(x[1]) * 10)), label: String(x[1]) }] })),
      ...[
        ["1/4+2/4","3/4"],["3/5+1/5","4/5"],["5/6-2/6","3/6"],["1/3と同じ大きさの分数","2/6"],["2/8を約分した分数","1/4"],["3/10+4/10","7/10"],["7/9-5/9","2/9"],["4/12を約分した分数","1/3"]
      ].map((x, i) => makeProblem(`g4-ma-frac-${i + 1}`, 4, "算数", i % 3 === 0 ? "choice" : "input", `${x[0]} の答えを書きましょう。`, x[1], [x[1]], `分母が同じ分数は、分子を計算します。答えは${x[1]}です。`, "分母をよく見ましょう。", "table", { headers: ["問題", "答え"], rows: [[x[0], "?"]] }, i % 3 === 0 ? { choices: [x[1], "1/2", "5/4", "1/8"] } : {})),
      ...[
        ["たて8cm、横6cmの長方形の面積", "48平方cm", 8, 6],["一辺7cmの正方形の面積", "49平方cm", 7, 7],["たて12m、横5mの花だんの面積", "60平方m", 12, 5],["たて9cm、横4cmのカードの面積", "36平方cm", 9, 4],["一辺10mの正方形の広場の面積", "100平方m", 10, 10],["たて15cm、横3cmの長方形の面積", "45平方cm", 15, 3],["たて6m、横11mの畑の面積", "66平方m", 6, 11],["一辺8cmの正方形の面積", "64平方cm", 8, 8]
      ].map((x, i) => makeProblem(`g4-ma-area-${i + 1}`, 4, "算数", "input", `${x[0]}を求めましょう。`, x[1], [x[1], x[1].replace("平方","")], `長方形や正方形の面積は、たて×横で求めます。答えは${x[1]}です。`, "たてと横をかけます。", "shape", { label: "面積", shapes: [{ kind: "rect", x: 105, y: 75, w: 210, h: 120, color: "#eaf4ff" }, { label: `${x[2]}`, x: 205, y: 62 }, { label: `${x[3]}`, x: 330, y: 140 }] })),
      ...[
        ["直角は何度ですか。","90度"],["半回転の角は何度ですか。","180度"],["三角形の内角の和は何度ですか。","180度"],["四角形の内角の和は何度ですか。","360度"],["30度と60度を合わせると何度ですか。","90度"],["120度から30度をひくと何度ですか。","90度"]
      ].map((x, i) => makeProblem(`g4-ma-angle-${i + 1}`, 4, "算数", i % 2 ? "input" : "choice", x[0], x[1], [x[1], x[1].replace("度","")], `角の大きさを考えると、答えは${x[1]}です。`, "直角は90度です。", "shape", angleVisual(), i % 2 ? {} : { choices: [x[1], "45度", "120度", "360度"].filter((v, idx, arr) => arr.indexOf(v) === idx) })),
      ...[
        [["月","火","水","木"],[8,12,9,15],"いちばん多い曜日","木"],[[ "A","B","C","D"],[24,18,30,12],"30を表す棒","C"],[["1組","2組","3組"],[16,21,19],"いちばん少ない組","1組"],[["春","夏","秋","冬"],[7,13,10,5],"夏と冬の差","8"],[["本","ノート","鉛筆"],[40,25,35],"全部で何こ","100"],[["東","西","南","北"],[11,17,14,10],"西は北よりいくつ多い","7"]
      ].map((x, i) => makeProblem(`g4-ma-graph-${i + 1}`, 4, "算数", "input", `棒グラフを見て、「${x[2]}」に答えましょう。`, x[3], [x[3]], `棒の高さや数を比べると、答えは${x[3]}です。`, "棒の上の数を見ます。", "barGraph", { labels: x[0], values: x[1] })),
      ...[
        ["1こ80円のノートを6こ買います。代金はいくらですか。","480円"],["24このクッキーを4人で同じ数ずつ分けます。1人分は何こですか。","6こ"],["3.5Lの水を4本分集めます。全部で何Lですか。","14L"],["96ページの本を1日12ページずつ読みます。何日で読み終わりますか。","8日"],["リボンを2.4mずつ3本切ります。全部で何m使いますか。","7.2m"],["48この花を6こずつ束にします。何束できますか。","8束"]
      ].map((x, i) => makeProblem(`g4-ma-word-${i + 1}`, 4, "算数", "input", x[0], x[1], [x[1], x[1].replace(/[円こlLm日束]/g, "")], `問題の場面に合う式を考えると、答えは${x[1]}です。`, "何を求める問題かを先に決めます。", "table", { headers: ["分かること", "求めること"], rows: [[x[0].slice(0, 12), "?"]] })),
      ...[
        ["1個80円の品物をx個買う代金の式","80×x"],["全部でa個のあめを4人で分ける式","a÷4"],["たて6cm、横xcmの長方形の面積の式","6×x"],["1本2.5Lの水をx本集める式","2.5×x"]
      ].map((x, i) => makeProblem(`g4-ma-formula-${i + 1}`, 4, "算数", "input", `${x[0]}を書きましょう。`, x[1], [x[1], x[1].replace("×","*").replace("÷","/")], `数量の関係を式にすると、${x[1]}です。`, "同じ量がいくつ分あるかを考えます。", "table", { headers: ["場面", "式"], rows: [[x[0], "?"]] }))
    ];
    return ja.concat(math.slice(0, 46).concat(math.slice(-4)));
  }

  function kanaShift(kana, offset) {
    const list = ["あ","い","う","え","お","か","き","く","け","こ","さ","し","す","せ","そ","た","ち","つ","て","と","な","に","ぬ","ね","の","は","ひ","ふ","へ","ほ","ま","み","む","め","も","や","ゆ","よ","ら","り","る","れ","ろ","わ"];
    const index = list.indexOf(kana);
    return list[(Math.max(index, 0) + offset) % list.length];
  }

  function shapeVisual1(kind) {
    if (kind === "circle") return { shapes: [{ kind: "circle", cx: 210, cy: 120, r: 58, color: "#ffd166" }], label: "かたち" };
    if (kind === "triangle") return { shapes: [{ kind: "triangle", points: "210,50 110,185 310,185", color: "#36c6a5" }], label: "かたち" };
    if (kind === "rectwide") return { shapes: [{ kind: "rect", x: 95, y: 85, w: 230, h: 80, color: "#ff7aa8" }], label: "かたち" };
    if (kind === "same") return { shapes: [{ kind: "circle", cx: 145, cy: 120, r: 45 }, { kind: "circle", cx: 275, cy: 120, r: 45 }], label: "おなじかたち" };
    return { shapes: [{ kind: "rect", x: 145, y: 65, w: 130, h: 130, color: "#eaf4ff" }], label: "かたち" };
  }

  function angleVisual() {
    return { shapes: [{ label: "∠", x: 120, y: 150 }, { kind: "triangle", points: "210,60 120,190 320,190", color: "#eaf4ff" }], label: "角" };
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
        return `<text x="${shape.x || 30}" y="${shape.y || 45 + i * 36}" font-size="38" font-weight="900">${escapeHtml(shape.label || "")}</text>`;
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
    return `<svg viewBox="0 0 320 300" role="img" aria-label="観察図"><text x="160" y="150" text-anchor="middle" font-size="22">${escapeHtml(data.label || "図")}</text></svg>`;
  }

  function renderEnglishCard(data) {
    return `<svg viewBox="0 0 360 260" role="img" aria-label="絵カード">
      <rect x="30" y="20" width="300" height="220" rx="8" fill="#fff" stroke="#2f80ed" stroke-width="5"/>
      <text x="180" y="92" text-anchor="middle" font-size="58">${escapeHtml(data.icon || "★")}</text>
      <text x="180" y="168" text-anchor="middle" font-size="33" font-weight="900" fill="#18324a">${escapeHtml(data.word || "")}</text>
      <text x="180" y="205" text-anchor="middle" font-size="18" fill="#60748a">${escapeHtml(data.label || "")}</text>
    </svg>`;
  }

  function heroSvg() {
    return `<svg viewBox="0 0 520 360" role="img" aria-label="学習イラスト"><rect x="46" y="52" width="428" height="250" rx="16" fill="#fff" stroke="#2f80ed" stroke-width="6"/><rect x="78" y="86" width="160" height="38" rx="8" fill="#eaf4ff"/><rect x="78" y="144" width="92" height="92" rx="8" fill="#ffd166"/><circle cx="300" cy="188" r="48" fill="#36c6a5"/><path d="M360 226 L420 104 L470 226 Z" fill="#ff7aa8"/><line x1="90" y1="270" x2="430" y2="270" stroke="#18324a" stroke-width="5" stroke-linecap="round"/><text x="156" y="210" text-anchor="middle" font-size="60" font-weight="900" fill="#18324a">国</text><text x="300" y="205" text-anchor="middle" font-size="52" font-weight="900" fill="#fff">算</text></svg>`;
  }

  function escapeHtml(value) {
    return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
})();
