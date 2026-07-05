(function () {
  "use strict";

  const GRADES = [1, 4];
  const SUBJECT_MODES = ["国語", "算数", "ミックス"];
  const POINTS = 5;
  const QUESTIONS_PER_TEST = 20;
  const HISTORY_KEY = "dailyAiStudy.kokugoMath.history.v3";
  const RECENT_KEY = "dailyAiStudy.kokugoMath.recent.v3";
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
    const recentKey = `${grade}:${subjectMode}`;
    const recent = getRecentIds(recentKey);
    const nonce = `${Date.now()}:${Math.random()}`;
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}:${grade}:${subjectMode}:${nonce}`;
    let picked;
    if (subjectMode === "ミックス") {
      const japanese = pickWithRecentAvoidance(bank.filter((p) => p.subject === "国語"), 10, recent, hashString(`${dateKey}:ja`));
      const math = pickWithRecentAvoidance(bank.filter((p) => p.subject === "算数"), 10, recent, hashString(`${dateKey}:math`));
      picked = seededShuffle(japanese.concat(math), hashString(`${dateKey}:mix`));
    } else {
      picked = pickWithRecentAvoidance(bank.filter((p) => p.subject === subjectMode), QUESTIONS_PER_TEST, recent, hashString(dateKey));
    }
    rememberRecentIds(recentKey, picked.map((p) => p.id));
    return picked;
  }

  function pickWithRecentAvoidance(items, count, recentIds, seed) {
    const fresh = items.filter((item) => !recentIds.includes(item.id));
    const pool = fresh.length >= count ? fresh : items;
    return seededShuffle(pool, seed).slice(0, count);
  }

  function getRecentIds(key) {
    try {
      const all = JSON.parse(localStorage.getItem(RECENT_KEY) || "{}");
      return Array.isArray(all[key]) ? all[key] : [];
    } catch {
      return [];
    }
  }

  function rememberRecentIds(key, ids) {
    try {
      const all = JSON.parse(localStorage.getItem(RECENT_KEY) || "{}");
      all[key] = ids.concat(all[key] || []).slice(0, 60);
      localStorage.setItem(RECENT_KEY, JSON.stringify(all));
    } catch {
      // localStorage may be unavailable in private contexts. Random selection still works.
    }
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
    const p = (id, type, q, a, answersOrExp, expOrHint, hintOrVisualType, visualTypeOrData, visualDataOrExtra, maybeExtra) => {
      const hasAnswers = Array.isArray(answersOrExp);
      const emptyAnswerSlot = answersOrExp === null;
      const shortForm = expOrHint === undefined;
      const answers = hasAnswers ? answersOrExp : [a];
      const exp = hasAnswers || emptyAnswerSlot ? expOrHint : answersOrExp;
      const hint = shortForm ? hintOrVisualType : hasAnswers || emptyAnswerSlot ? hintOrVisualType : expOrHint;
      const visualType = shortForm ? visualTypeOrData : hasAnswers || emptyAnswerSlot ? visualTypeOrData : hintOrVisualType;
      const visualData = shortForm ? visualDataOrExtra : hasAnswers || emptyAnswerSlot ? visualDataOrExtra : visualTypeOrData;
      const extra = shortForm ? maybeExtra : hasAnswers || emptyAnswerSlot ? maybeExtra : visualDataOrExtra;
      return makeProblem(`g1-ja-${id}`, 1, "国語", type, q, a, answers, exp, hint, visualType, visualData, extra);
    };
    const ja = [
      ...[
        ["pic-1","🌷","はるの にわに さいて います。","はな"],["pic-2","🐱","まどの そばで ねています。","ねこ"],["pic-3","☂️","あめの ひに つかいます。","かさ"],["pic-4","🍙","おべんとうに はいっています。","おにぎり"],["pic-5","✏️","もじを かく どうぐです。","えんぴつ"],["pic-6","🚲","こうえんまで のって いきます。","じてんしゃ"],["pic-7","🐸","いけの そばで ないています。","かえる"],["pic-8","🍑","あまい くだものです。","もも"]
      ].map((x) => p(x[0], "input", "えと ことばカードを 見て、なまえを ひらがなで かきましょう。", x[3], `えは「${x[3]}」です。`, "えと せつめいを あわせて よみましょう。", "englishPictureCard", { icon: x[1], word: "?", label: x[2] })),
      ...[
        ["story-1",["あさ、みおは きんぎょに えさを あげました。","きんぎょは すいすい およぎました。"],"みおが えさを あげた ものを かきましょう。","きんぎょ","みおがえさをあげたのは、きんぎょです。"],
        ["story-2",["ゆうたは くつを そろえました。","おかあさんは にこにこ しました。"],"ゆうたが そろえた ものを かきましょう。","くつ","ゆうたはくつをそろえました。"],
        ["story-3",["りなは うさぎの えを かきました。","ともだちは かわいいねと いいました。"],"りなが かいた ものを えらびましょう。","うさぎ","りながかいたのは、うさぎのえです。",["うさぎ","くるま","さかな"]],
        ["story-4",["そらが くらく なりました。","たくは かさを もって でかけました。"],"たくが もって でかけた ものを かきましょう。","かさ","そらがくらくなり、たくはかさを持ちました。"],
        ["story-5",["はなさんは ほんを かりました。","よる、こえに 出して よみました。"],"はなさんが よるに した ことを えらびましょう。","ほんをよんだ","よるに本を読みました。",["ほんをよんだ","はしった","えをけした"]],
        ["story-6",["ともやは たねを まきました。","まいあさ みずを あげました。"],"ともやが まいあさ あげた ものを かきましょう。","みず","毎朝あげたのは水です。"],
        ["story-7",["あきは つみきを かさねました。","たかい とうが できました。"],"あきが つくった ものを えらびましょう。","とう","積み木で高い塔を作りました。",["とう","ふね","はな"]],
        ["story-8",["けんは てがみを よみました。","おばあちゃんからの てがみでした。"],"てがみを くれた 人を かきましょう。","おばあちゃん","手紙はおばあちゃんからでした。"]
      ].map((x) => p(x[0], x[5] ? "choice" : "input", x[2], x[3], x[4], "だれが、なにをしたかを さがしましょう。", "readingCard", { title: "おはなし", lines: x[1] }, x[5] ? { choices: x[5] } : {})),
      ...[
        ["notice-1",["おしらせ","あしたは ずこうです。","はさみと のりを もって きましょう。"],"あした もって くる ものを ひとつ かきましょう。","はさみ","お知らせには、はさみとのりと書いてあります。"],
        ["notice-2",["えんそく","あさ 8じに もんに あつまります。","すいとうを わすれないでね。"],"あつまる じこくを かきましょう。","8じ","集合時刻は8時です。"],
        ["notice-3",["としょしつ","ひるやすみに あいています。","かりた ほんは かえしましょう。"],"ひるやすみに あいている へやを かきましょう。","としょしつ","昼休みに開いているのは図書室です。"],
        ["notice-4",["やくそく","ろうかは あるきます。","はしると あぶないです。"],"ろうかで する ことを えらびましょう。","あるく","廊下は歩くと書いてあります。",["あるく","はしる","ねる"]],
        ["notice-5",["おてつだい","はなの みずやりは げつようです。","あさの かいの まえに します。"],"みずやりを する ようびを かきましょう。","げつよう","水やりは月曜です。"],
        ["notice-6",["ポスター","てを あらおう。","そとから かえったら せっけんを つかいます。"],"そとから かえったら つかう ものを かきましょう。","せっけん","ポスターには石けんを使うとあります。"]
      ].map((x) => p(x[0], x[5] ? "choice" : "input", x[2], x[3], x[4], "おしらせの ことばを よく 見ましょう。", "readingCard", { title: x[1][0], lines: x[1].slice(1) }, x[5] ? { choices: x[5] } : {})),
      ...[
        ["sentence-1",["ぼくは（　）を よみます。","え: 📕"],"（　）に 入る ことばを かきましょう。","ほん","本を読む、が自然です。"],
        ["sentence-2",["あめが ふったので、（　）を さしました。","え: ☂️"],"（　）に 入る ことばを かきましょう。","かさ","雨の日にさすものは、かさです。"],
        ["sentence-3",["おさらを（　）で あらいました。","え: 💧"],"（　）に 入る ことばを えらびましょう。","みず","皿は水で洗います。",["みず","そら","くつ"]],
        ["sentence-4",["ねこが（　）と なきました。","え: 🐱"],"（　）に 入る おとを かきましょう。","にゃあ","ねこの鳴き声は、にゃあです。"],
        ["sentence-5",["あさ、げんきに（　）と いいました。","ともだちに あった とき"],"（　）に 入る あいさつを えらびましょう。","おはよう","朝のあいさつは、おはようです。",["おはよう","さようなら","いただきます"]],
        ["sentence-6",["おべんとうを たべる まえに（　）と いいます。"],"（　）に 入る ことばを かきましょう。","いただきます","食べる前のあいさつは、いただきますです。"]
      ].map((x) => p(x[0], x[5] ? "choice" : "input", x[2], x[3], x[4], "文と えを あわせて 考えましょう。", "readingCard", { title: "文づくり", lines: x[1] }, x[5] ? { choices: x[5] } : {})),
      ...[
        ["dialog-1",["先生「ならぶ じゅんばんを まもりましょう。」","れん「はい、うしろに ならびます。」"],"れんは どこに ならびますか。","うしろ","れんは後ろに並ぶと言っています。"],
        ["dialog-2",["あや「この はな、いい においだね。」","まい「みんなにも 見せたいな。」"],"ふたりが 見ている ものを えらびましょう。","はな","会話では花を見ています。",["はな","いす","くつ"]],
        ["dialog-3",["ゆい「えんぴつを かして。」","なお「どうぞ。あとで かえしてね。」"],"ゆいが かりた ものを かきましょう。","えんぴつ","ゆいは鉛筆を借りました。"],
        ["dialog-4",["はる「ボールが ころがったよ。」","こう「ぼくが ひろうね。」"],"こうが ひろう ものを えらびましょう。","ボール","転がったボールを拾います。",["ボール","ほん","かさ"]],
        ["dialog-5",["りく「つぎは ぼくが よむね。」","みな「ゆっくり よむと きこえるよ。」"],"りくが つぎに する ことを かきましょう。","よむ","次に読むと言っています。"],
        ["dialog-6",["さき「まどを しめても いい？」","先生「さむいから おねがいします。」"],"さきが しめる ものを かきましょう。","まど","閉めるものは窓です。"]
      ].map((x) => p(x[0], x[5] ? "choice" : "input", x[2], x[3], x[4], "ふきだしの ことばを よみましょう。", "readingCard", { title: "かいわ", lines: x[1] }, x[5] ? { choices: x[5] } : {})),
      ...[
        ["order-1",["1 てを あらう","2 せきに すわる","3 いただきます"],"いちばん はじめに する ことを かきましょう。","てをあらう","一番はじめは手を洗うことです。"],
        ["order-2",["1 たねを まく","2 みずを あげる","3 めが 出る"],"さいごに おこる ことを えらびましょう。","めが出る","最後に芽が出ます。",["めが出る","たねをまく","みずをあげる"]],
        ["order-3",["1 くつを はく","2 ぼうしを かぶる","3 そとへ 出る"],"そとへ 出る まえに はく ものを かきましょう。","くつ","外へ出る前に靴を履きます。"],
        ["letter-1",["おばあちゃんへ","きのう こまを まわせたよ。","また みに きてね。"],"できるように なった あそびを かきましょう。","こま","手紙には、こまを回せたとあります。"],
        ["diary-1",["にっき","きょうは うみで かいを ひろいました。","しろい かいが いちばん きれいでした。"],"いちばん きれいだった かいの いろを かきましょう。","しろい","白い貝が一番きれいでした。"],
        ["diary-2",["にっき","あさがおが さいた。","あおい はなが ふたつ さいた。"],"さいた はなの いろを えらびましょう。","あおい","咲いた花は青い花です。",["あおい","あかい","しろい"]]
      ].map((x) => p(x[0], x[5] ? "choice" : "input", x[2], x[3], x[4], "じゅんばんや だいじな ことばを 見ましょう。", "readingCard", { title: x[0].startsWith("letter") ? "てがみ" : x[0].startsWith("diary") ? "にっき" : "じゅんばん", lines: x[1] }, x[5] ? { choices: x[5] } : {})),
      ...[
        ["comic-1",["みき「この みちを まっすぐ いくよ。」","たく「つぎの かどで まがるんだね。」"],"たくは どこで まがりますか。","つぎのかど","次の角で曲がると話しています。"],
        ["comic-2",["ゆな「はこが おもいね。」","れお「ふたりで もとう。」"],"れおが しようと した ことを えらびましょう。","ふたりでもつ","二人で持とうと言っています。",["ふたりでもつ","ひとりでかえる","はこをあける"]],
        ["comic-3",["そうじカード","1 つくえを よせる","2 ほうきで はく","3 つくえを もどす"],"二ばんめに する ことを かきましょう。","ほうきではく","二番目はほうきではくことです。"],
        ["comic-4",["まちの ポスター","ごみは もちかえろう","みんなで きれいな こうえんに"],"もちかえる ものを かきましょう。","ごみ","ポスターには、ごみを持ち帰ろうとあります。"],
        ["comic-5",["あさの かい","きょうの かかりは くばりものです。","れんらくちょうを くばります。"],"くばる ものを えらびましょう。","れんらくちょう","配るものは連絡帳です。",["れんらくちょう","ぼうし","くつ"]],
        ["comic-6",["えにっき","きのう、はじめて こまが まわった。","うれしくて なんども やった。"],"書いた 人の きもちを えらびましょう。","うれしい","うれしくて何度もしたとあります。",["うれしい","かなしい","ねむい"]],
        ["comic-7",["メモ","あした もってくるもの","ぞうきん 1まい / ぐんて"],"あした もってくる ものを ひとつ かきましょう。","ぞうきん",["ぞうきん","ぐんて"],"メモには、ぞうきんと軍手が書いてあります。"],
        ["comic-8",["みな「この ほん、おもしろかったよ。」","あお「どんな ところ？」","みな「さいごに みんなで わらう ところ。」"],"みなが おもしろいと 思った ところを かきましょう。","みんなでわらうところ","最後にみんなで笑うところです。"],
        ["comic-9",["おみせやさん","りんご あります","みかん あります","ばななは うりきれ"],"うりきれの くだものを かきましょう。","ばなな","売り切れはバナナです。"],
        ["comic-10",["たろう「てを あらったよ。」","先生「では、きゅうしょくを くばりましょう。」"],"たろうが さきに した ことを かきましょう。","てをあらった","先に手を洗っています。"]
      ].map((x) => {
        const choices = Array.isArray(x[5]) ? x[5] : null;
        const answers = Array.isArray(x[4]) ? x[4] : [x[3]];
        const explanation = Array.isArray(x[4]) ? x[5] : x[4];
        return p(x[0], choices ? "choice" : "input", x[2], x[3], answers, explanation, "文章や会話の中の手がかりを見つけます。", "readingCard", { title: "読む資料", lines: x[1], small: true }, choices ? { choices } : {});
      })
    ];

    const m = (id, type, q, a, ans, exp, hint, visualType, visualData, extra) =>
      makeProblem(`g1-ma-${id}`, 1, "算数", type, q, a, ans || [a], exp, hint, visualType, visualData, extra);
    const math = [
      ...[
        ["count-1","🍎",7,"りんご"],["count-2","🐟",6,"さかな"],["count-3","⭐",9,"ほし"],["count-4","🌼",8,"はな"],["count-5","🍙",5,"おにぎり"],["count-6","🎈",10,"ふうせん"]
      ].map((x) => m(x[0], "input", `図の${x[3]}は ぜんぶで なんこですか。`, String(x[2]), [String(x[2]), `${x[2]}こ`], `ひとつずつ数えると${x[2]}こです。`, "指でさしながら数えます。", "countingObjects", { icon: x[1], count: x[2] })),
      ...[
        ["add-1","赤いシールが4まい、青いシールが3まいあります。ぜんぶでなんまいですか。",7,"⭐"],["add-2","かごにみかんが5こ、さらに2こ入れました。ぜんぶでなんこですか。",7,"🍊"],["add-3","バスに6にん、あとから4にんのりました。なんにんですか。",10,"🚌"],["add-4","つみきが8こあります。2こもらいました。ぜんぶでなんこですか。",10,"🧱"],["add-5","池にあひるが3わ、あとから5わきました。なんわですか。",8,"🦆"],["add-6","えんぴつが7ほん、赤えんぴつが3ぼんあります。ぜんぶでなんぼんですか。",10,"✏️"],["sub-1","クッキーが9こあります。4こ食べました。のこりはなんこですか。",5,"🍪"],["sub-2","風船が8こあります。3こくばりました。のこりはなんこですか。",5,"🎈"],["sub-3","魚が10ぴきいます。2ひきかくれました。見えているのはなんびきですか。",8,"🐟"],["sub-4","どんぐりが7こあります。1こ落としました。のこりはなんこですか。",6,"🟤"],["sub-5","ノートが6さつあります。2さつしまいました。出ているのはなんさつですか。",4,"📘"],["sub-6","花が10本さいています。5本つみました。のこりはなん本ですか。",5,"🌷"]
      ].map((x) => m(x[0], "input", x[1], String(x[2]), [String(x[2]), `${x[2]}こ`, `${x[2]}まい`, `${x[2]}にん`, `${x[2]}ほん`, `${x[2]}わ`, `${x[2]}ひき`, `${x[2]}さつ`], `場面を図で考えると、答えは${x[2]}です。`, "増えるか減るかを先に考えます。", "countingObjects", { icon: x[3], count: x[2] })),
      ...[
        ["line-1",0,10,6,"うさぎが止まったところ"],["line-2",0,12,9,"旗の立っているところ"],["line-3",2,10,5,"シールの場所"],["line-4",0,20,14,"ゴールの近く"],["line-5",5,15,11,"車がいる場所"],["line-6",0,18,8,"星を置いた場所"]
      ].map((x) => m(x[0], "choice", `数直線を見て、${x[4]}の数をえらびましょう。`, String(x[3]), [String(x[3])], `印は${x[3]}のところにあります。`, "左から順に数えます。", "numberLine", { min: x[1], max: x[2], tickStep: x[2] > 12 ? 2 : 1, points: [{ value: x[3], label: "●" }] }, { choices: [String(x[3]), String(x[3] - 1), String(x[3] + 1)] })),
      ...[
        ["clock-1",7,0,"7じ","あさのしたく"],["clock-2",3,0,"3じ","おやつ"],["clock-3",9,0,"9じ","ねるじこく"],["clock-4",2,30,"2じ30ぷん","こうえんへ行く"],["clock-5",6,30,"6じ30ぷん","ばんごはん"],["clock-6",10,30,"10じ30ぷん","よみきかせ"]
      ].map((x) => m(x[0], "input", `時計を見て、${x[4]}の時こくをかきましょう。`, x[3], [x[3], x[3].replace("じ","時").replace("ぷん","分")], `時計は${x[3]}をさしています。`, "短い針を先に見ます。", "clock", { hour: x[1], minute: x[2] })),
      ...[
        ["shape-1","まる","circle","ころがる形"],["shape-2","さんかく","triangle","3つのかど"],["shape-3","しかく","rect","4つのかど"],["shape-4","ながしかく","rectwide","横に長い形"],["shape-5","おなじかたち","same","二つをくらべる"],["shape-6","かどが4つ","corners","かどを数える"]
      ].map((x, i) => m(x[0], i % 2 ? "choice" : "input", `図を見て、${x[3]}に合う答えをかきましょう。`, x[1], [x[1]], `図の形は「${x[1]}」です。`, "辺や角、丸さを見ます。", "shape", shapeVisual1(x[2]), i % 2 ? { choices: [x[1], "まる", "さんかく"].filter((v, idx, arr) => arr.indexOf(v) === idx) } : {})),
      ...[
        ["money-1","10円玉が1まい、1円玉が3まいあります。ぜんぶでなん円ですか。","13円",["10円","1円","1円","1円"]],["money-2","5円玉が1まい、1円玉が4まいあります。ぜんぶでなん円ですか。","9円",["5円","1円","1円","1円","1円"]],["money-3","10円玉が2まいあります。ぜんぶでなん円ですか。","20円",["10円","10円"]],["len-1","リボンAは6cm、リボンBは9cmです。長いほうをかきましょう。","B",["A 6cm","B 9cm"]],["len-2","水が入っているコップは、Aが3、Bが5の目もりです。多いほうをかきましょう。","B",["A 3","B 5"]],["num-1","10を、6といくつに分けられますか。","4",["6","?","ぜんぶ10"]],["num-2","8は、3といくつに分けられますか。","5",["3","?","ぜんぶ8"]],["num-3","12より1小さい数をかきましょう。","11",["10","11","12"]]
      ].map((x) => m(x[0], "input", x[1], x[2], [x[2], x[2].replace("円","")], `図や表から考えると、答えは${x[2]}です。`, "見えている数をたしかめます。", "readingCard", { title: "さんすうカード", lines: x[3] })),
      ...[
        ["table-1",["赤 4こ","青 5こ","黄 2こ"],"表を見て、赤と青をあわせた数をかきましょう。","9",["9","9こ"],"4+5=9です。"],
        ["table-2",["前から 3ばんめ: みお","前から 5ばんめ: そら"],"みおとそらの あいだに いる 人は なん人ですか。","1",["1","1人"],"3番目と5番目の間は4番目の1人です。"],
        ["table-3",["A 7こ","B 4こ"],"AはBより なんこ 多いですか。","3",["3","3こ"],"7-4=3です。"],
        ["table-4",["えんぴつ 8本","けしごむ 2こ"],"えんぴつを けしごむより なんこ 多く もっていますか。","6",["6","6本"],"8-2=6です。"],
        ["table-5",["10のまとまり 1こ","ばら 6こ"],"数を かきましょう。","16",["16"],"10と6で16です。"],
        ["table-6",["10のまとまり 2こ","ばら 0こ"],"数を かきましょう。","20",["20"],"10が二つで20です。"]
      ].map((x) => m(x[0], "input", x[2], x[3], x[4], x[5], "表の数を使って考えます。", "readingCard", { title: "表の問題", lines: x[1] }))
    ];
    return ja.concat(math).map(withBetterHint);
  }

  function grade4Bank() {
    const p = (id, type, q, a, answersOrExp, expOrHint, hintOrVisualType, visualTypeOrData, visualDataOrExtra, maybeExtra) => {
      const hasAnswers = Array.isArray(answersOrExp);
      const emptyAnswerSlot = answersOrExp === null;
      const shortForm = expOrHint === undefined;
      const answers = hasAnswers ? answersOrExp : [a];
      const exp = hasAnswers || emptyAnswerSlot ? expOrHint : answersOrExp;
      const hint = shortForm ? hintOrVisualType : hasAnswers || emptyAnswerSlot ? hintOrVisualType : expOrHint;
      const visualType = shortForm ? visualTypeOrData : hasAnswers || emptyAnswerSlot ? visualTypeOrData : hintOrVisualType;
      const visualData = shortForm ? visualDataOrExtra : hasAnswers || emptyAnswerSlot ? visualDataOrExtra : visualTypeOrData;
      const extra = shortForm ? maybeExtra : hasAnswers || emptyAnswerSlot ? maybeExtra : visualDataOrExtra;
      return makeProblem(`g4-ja-${id}`, 4, "国語", type, q, a, answers, exp, hint, visualType, visualData, extra);
    };
    const ja = [
      ...[
        ["read-1",["放課後、花さんは教室の窓を閉めてから帰った。","朝、先生は『雨が入らず助かったよ』と話した。"],"花さんの行動が役立った理由を短く書きましょう。","雨が入らなかったから",["雨が入らなかったから","雨が入るのを防いだから"],"窓を閉めたことで、雨が教室に入りませんでした。"],
        ["read-2",["校庭のすみで小さな芽を見つけた。","クラスは札を立て、踏まれないようにした。"],"クラスが札を立てた目的を選びましょう。","芽を守るため",null,"札は小さな芽を守るために立てました。",["芽を守るため","早く走るため","水を止めるため","紙を配るため"]],
        ["read-3",["図書委員は新しい本の紹介カードを入口に置いた。","昼休みに本を手に取る人が増えた。"],"紹介カードを置いた後に起きた変化を短く書きましょう。","本を手に取る人が増えた",["本を手に取る人が増えた","借りる人が増えた"],"カードによって本に関心をもつ人が増えました。"],
        ["read-4",["雨の日、班長はいつもよりゆっくり歩いた。","後ろの一年生もすべらずに学校へ着いた。"],"班長の気持ちとして合うものを選びましょう。","安全に歩いてほしい",null,"班長は一年生の安全を考えています。",["安全に歩いてほしい","急いで先に行きたい","雨を見たくない","列を短くしたい"]],
        ["read-5",["祭りの会場に、昔の道具を説明する札があった。","子どもたちは使い方を読みながら見学した。"],"説明する札があるよさを短く書きましょう。","使い方が分かる",["使い方が分かる","道具の使い方が分かる"],"札があると、道具の使い方を知ることができます。"],
        ["read-6",["新聞係は写真の下に短い説明をつけた。","読む人は、どの場面の写真かすぐ分かった。"],"写真の下の説明が役立った理由を選びましょう。","写真の内容が分かりやすいから",null,"説明が写真の内容を助けています。",["写真の内容が分かりやすいから","写真が小さくなるから","読む人が減るから","色が同じになるから"]],
        ["read-7",["係会で二つの案が出た。","すぐ決めずに、よい点と心配な点を表にした。"],"表にした目的を短く書きましょう。","比べて考えるため",["比べて考えるため","よい点と心配な点を比べるため"],"表にすると案を比べやすくなります。"],
        ["read-8",["遠足のしおりを読んだ健さんは、集合時刻に線を引いた。","家でもう一度たしかめ、早めにねた。"],"健さんの行動として大切なことを選びましょう。","大切な情報を確かめた",null,"集合時刻を見落とさないように確認しています。",["大切な情報を確かめた","しおりをなくした","友だちにまかせた","時刻を変えた"]]
      ].map((x) => p(x[0], x[6] ? "choice" : "input", x[2], x[3], x[4], x[5], "行動と結果をつなげて読みます。", "readingCard", { title: "読解", lines: x[1] }, x[6] ? { choices: x[6] } : { longAnswer: true })),
      ...[
        ["kanji-1",["運動会の練習で、赤組と白組が（きょうりょく）して道具を運んだ。"],"（　）の中のひらがなを漢字で書きましょう。","協力","文の中では、力を合わせる意味で使われています。"],
        ["kanji-2",["川の水の量を（かんさつ）し、前の日との違いを記録した。"],"（　）の中のひらがなを漢字で書きましょう。","観察","よく見て記録する場面です。"],
        ["kanji-3",["発表の前に、伝える順番を（せいり）した。"],"（　）の中のひらがなを漢字で書きましょう。","整理","分かりやすく整える意味です。"],
        ["kanji-4",["短い時間でも毎日続けた（どりょく）が、音読の声に表れた。"],"（　）の中のひらがなを漢字で書きましょう。","努力","続けて力をつくすことです。"],
        ["kanji-5",["係の仕事に（ひつよう）な道具を、前の日に用意した。"],"（　）の中のひらがなを漢字で書きましょう。","必要","なくてはならない道具を表しています。"],
        ["kanji-6",["試合の（けっか）を見て、次の練習のめあてを決めた。"],"（　）の中のひらがなを漢字で書きましょう。","結果","終わった後に出たことです。"],
        ["kanji-7",["急な雨でも、先生は（れいせい）に避難場所を伝えた。"],"（　）の中のひらがなを漢字で書きましょう。","冷静","落ち着いて行動する様子です。"],
        ["kanji-8",["町の人と交わした（やくそく）を守り、公園をきれいに使った。"],"（　）の中のひらがなを漢字で書きましょう。","約束","守ると決めたことです。"]
      ].map((x) => p(x[0], "input", x[2], x[3], [x[3]], `正答は「${x[3]}」です。${x[4]}`, "文全体の意味に合う漢字を考えます。", "readingCard", { title: "漢字の文", lines: x[1] })),
      ...[
        ["data-1",["アンケート 休み時間にしたいこと","読書 8人 / 外遊び 14人 / 絵をかく 6人"],"一番多い希望を選びましょう。","外遊び",null,"14人で外遊びが一番多いです。",["外遊び","読書","絵をかく","同じ"]],
        ["data-2",["学校新聞 見出し","四年生、川のごみ調べを発表","下級生にも分かるよう写真を使った"],"発表で写真を使った理由を短く書きましょう。","分かりやすくするため",["分かりやすくするため","下級生にも分かるようにするため"],"写真は内容を分かりやすく伝えるために使われています。"],
        ["data-3",["ポスター","本を一冊えらんで、友だちに紹介しよう","紹介カードには、題名とおすすめの理由を書く"],"紹介カードに書くことを一つ答えましょう。","題名",["題名","おすすめの理由"],"ポスターには題名とおすすめの理由とあります。"],
        ["data-4",["お知らせ","土曜日の校庭そうじは雨のため中止","次回は来週の水曜日"],"校庭そうじが中止になった理由を選びましょう。","雨のため",null,"雨のため中止と書かれています。",["雨のため","人数が多いため","道具が新しいため","水曜日のため"]],
        ["data-5",["日記","今日の話し合いでは、先に友だちの考えを聞いた。","自分とちがう考えにもよいところがあった。"],"書き手が気づいたことを短く書きましょう。","ちがう考えにもよいところがある",["ちがう考えにもよいところがある","友だちの考えにもよいところがある"],"日記の最後に気づきが書かれています。"],
        ["data-6",["手紙","商店街のみなさんへ","見学で分かったことを、新聞にまとめました。","読んでいただけるとうれしいです。"],"手紙を書いた目的を選びましょう。","新聞を読んでもらうため",null,"新聞を読んでもらいたい気持ちで書いています。",["新聞を読んでもらうため","店を閉めるため","道を変えるため","時間を忘れるため"]],
        ["data-7",["会話","美咲『説明が長いと読みにくいね。』","大地『大事な言葉を残して短くしよう。』"],"大地さんの考えに近いものを答えましょう。","大事な言葉を残して短くする",["大事な言葉を残して短くする","大事な言葉を残す"],"大地さんは要点を残して短くする提案をしています。"],
        ["data-8",["広告","朝市 9時から11時まで","地元の野菜をならべます","場所 中央公園前"],"朝市が開かれる場所を答えましょう。","中央公園前",["中央公園前"],"広告の場所の欄に書かれています。"]
      ].map((x) => p(x[0], x[6] ? "choice" : "input", x[2], x[3], x[4], x[5], "資料の中の必要な情報を探します。", "readingCard", { title: "資料", lines: x[1], small: true }, x[6] ? { choices: x[6] } : { longAnswer: true })),
      ...[
        ["comp-1",["雨がやんだ（　）、校庭で遊べるようになった。"],"文のつながりに合う言葉を選びましょう。","ので",null,"理由から結果につながるので「ので」が合います。",["ので","けれど","または","ところが"]],
        ["comp-2",["発表を聞く人に伝わるように、声の大きさを（　）した。"],"（　）に合う言葉を答えましょう。","工夫","伝わるように方法を考えています。"],
        ["comp-3",["朝は晴れていた。（　）、昼すぎから強い雨が降った。"],"文のつながりに合う言葉を選びましょう。","ところが",null,"前と後で大きく変わるので「ところが」が合います。",["ところが","だから","そして","たとえば"]],
        ["comp-4",["調べたことを読む人に伝えるため、表と写真を入れた。"],"この文の目的にあたる部分を短く書きましょう。","読む人に伝えるため",["読む人に伝えるため"],"「ため」は目的を示しています。"],
        ["comp-5",["係は、低学年にも読めるように漢字にふりがなをつけた。"],"係がふりがなをつけた理由を答えましょう。","低学年にも読めるように",["低学年にも読めるように"],"理由は文の前半にあります。"],
        ["comp-6",["パンフレットを作るとき、写真の近くに説明を置いた。"],"説明を写真の近くに置くよさを選びましょう。","写真の内容が分かりやすい",null,"写真と説明が近いと対応が分かります。",["写真の内容が分かりやすい","字が消える","読む順番がなくなる","写真が動く"]],
        ["comp-7",["わたしは、校庭の木を守る活動に参加したい。なぜなら、（　）。"],"（　）に入る理由を短く書きましょう。","木はみんなの休み場所になるから",["木はみんなの休み場所になるから","木かげで休めるから"],"前の意見を支える理由を書きます。"],
        ["comp-8",["文章を『はじめ・中・終わり』に分けて読み直した。"],"読み直した目的として合うものを選びましょう。","内容のまとまりをつかむため",null,"三つに分けるとまとまりが見えます。",["内容のまとまりをつかむため","文字を小さくするため","題名を消すため","声をそろえるため"]]
      ].map((x) => p(x[0], x[6] ? "choice" : "input", x[2], x[3], x[4], x[5], "前後のつながりと目的を考えます。", "readingCard", { title: "文を整える", lines: x[1] }, x[6] ? { choices: x[6] } : { longAnswer: true })),
      ...[
        ["sum-1",["一輪車の練習を始めたころ、すぐに足をついていた。","毎日、校庭の線に沿って少しずつ進んだ。","一週間後、十メートル進めるようになった。"],"この文章の中心に合う見出しを選びましょう。","練習でできるようになった一輪車",null,"練習を続けて上達したことが中心です。",["練習でできるようになった一輪車","雨の日の読書","新しい給食","図書室の約束"]],
        ["sum-2",["町の川には、春になると小さな魚がもどってくる。","地域の人はごみを拾い、水がにごらないよう見守っている。"],"地域の人が川でしていることを短く書きましょう。","ごみを拾い見守っている",["ごみを拾い見守っている","ごみを拾っている"],"川を守る行動が書かれています。"],
        ["sum-3",["朝会で校長先生は、あいさつは相手を大切にする合図だと話した。","その日から、門の前の声が少し明るくなった。"],"話を聞いた後の変化を答えましょう。","あいさつの声が明るくなった",["声が明るくなった","あいさつの声が明るくなった"],"門の前の声が明るくなりました。"],
        ["sum-4",["米作り体験で、田植えの後も水の量を確かめた。","収穫だけでなく、世話の続きが大切だと分かった。"],"分かったこととして合うものを選びましょう。","世話を続けることが大切",null,"最後の文に学びが書かれています。",["世話を続けることが大切","収穫だけすればよい","水は見なくてよい","田植えは遊びである"]],
        ["sum-5",["読書会では、同じ本でも心に残った場面が人によってちがった。","友だちの話を聞くと、自分では気づかなかった見方が分かった。"],"読書会のよさを短く書きましょう。","ちがう見方に気づける",["ちがう見方に気づける","友だちの見方が分かる"],"友だちの話から新しい見方に気づいています。"],
        ["sum-6",["掲示板の地図には、集合場所と通ってはいけない道が色分けされていた。","初めて来た人にも分かりやすかった。"],"地図が分かりやすい理由を選びましょう。","場所と道が色分けされているから",null,"色分けが情報を整理しています。",["場所と道が色分けされているから","字が全部同じだから","道がかくれているから","地図がないから"]],
        ["sum-7",["そうじの時間、窓のさんに砂がたまっていることに気づいた。","いつもの床だけでなく、細かい場所も見るようにした。"],"書き手が変えた行動を答えましょう。","細かい場所も見るようにした",["細かい場所も見るようにした"],"気づいた後、見る場所を広げています。"],
        ["sum-8",["学級会では、意見を出す前に困っていることをカードに書いた。","何を解決したいかがはっきりして、話し合いが進んだ。"],"カードに書いたことの効果を選びましょう。","解決したいことがはっきりした",null,"カードで課題が明確になりました。",["解決したいことがはっきりした","話し合いが止まった","意見が消えた","全員が帰った"]]
      ].map((x) => p(x[0], x[6] ? "choice" : "input", x[2], x[3], x[4], x[5], "文章全体で何が変わったかを見ます。", "readingCard", { title: "まとめ読み", lines: x[1], small: true }, x[6] ? { choices: x[6] } : { longAnswer: true })),
      ...[
        ["paper-1",["学級新聞","見出し: 雨の日の遊びを見直そう","本文: 廊下で走らず、教室でできる遊びを紹介した。"],"見出しに合う本文の内容を短く書きましょう。","教室でできる遊びの紹介",["教室でできる遊びの紹介","雨の日の遊びの紹介"],"見出しと本文は雨の日の遊びでつながっています。"],
        ["paper-2",["ポスター","水とうを持ってこよう","暑い日は休み時間の前後に水分をとります。"],"ポスターで呼びかけていることを選びましょう。","水とうを持ってくること",null,"ポスターの中心は水とうを持ってくることです。",["水とうを持ってくること","本を返すこと","窓を閉めること","走ること"]],
        ["paper-3",["アンケート結果","朝読書で読みたい本","物語 18人 / 図鑑 9人 / 詩 5人"],"この結果から分かることを短く書きましょう。","物語を読みたい人が一番多い",["物語を読みたい人が一番多い","物語が一番多い"],"18人の物語が最多です。"],
        ["paper-4",["説明文","ホウセンカは、くきがのびるにつれて葉の数も増える。","同じ場所を続けて見ると、変化に気づきやすい。"],"変化に気づきやすくする方法を答えましょう。","同じ場所を続けて見る",["同じ場所を続けて見る"],"同じ場所を続けて見ることが方法です。"],
        ["paper-5",["会話","司会『先に困っていることを出しましょう。』","記録『それから解決する案を書きます。』"],"話し合いの順番として正しいものを選びましょう。","困っていること、解決する案",null,"先に困っていること、その後に案です。",["困っていること、解決する案","解決する案、題名","感想、天気","名前、給食"]],
        ["paper-6",["手紙","見学を受け入れてくださり、ありがとうございました。","教えていただいた仕事の工夫を、発表で伝えます。"],"手紙の相手に伝えている感謝の理由を短く書きましょう。","見学を受け入れてくれたから",["見学を受け入れてくれたから","見学を受け入れてくださったから"],"見学を受け入れてくれたことへの感謝です。"],
        ["paper-7",["物語","転校してきた友だちは、休み時間も席にすわっていた。","真央さんは自分の好きな本を持って近づいた。"],"真央さんの行動に合う気持ちを選びましょう。","話しかけるきっかけを作りたい",null,"本を持って近づき、関わろうとしています。",["話しかけるきっかけを作りたい","席を取りたい","本をかくしたい","急いで帰りたい"]],
        ["paper-8",["説明文","地域の祭りでは、太鼓の音が始まりの合図になる。","音が聞こえると、人々は広場に集まる。"],"太鼓の音の役割を答えましょう。","始まりの合図",["始まりの合図"],"本文に始まりの合図とあります。"],
        ["paper-9",["お知らせ","明日の委員会は、図書室ではなく音楽室で行います。","持ち物は筆記用具だけです。"],"委員会を行う場所を答えましょう。","音楽室",["音楽室"],"図書室ではなく音楽室です。"],
        ["paper-10",["広告","商店街スタンプラリー","三つの店でスタンプを集めると、花の種を配ります。"],"花の種を受け取る条件を短く書きましょう。","三つの店でスタンプを集める",["三つの店でスタンプを集める"],"三つの店でスタンプを集めることが条件です。"]
      ].map((x) => p(x[0], x[6] ? "choice" : "input", x[2], x[3], x[4], x[5], "資料の目的と条件を読み取ります。", "readingCard", { title: "実用文", lines: x[1], small: true }, x[6] ? { choices: x[6] } : { longAnswer: true }))
    ];

    const m = (id, type, q, a, answers, exp, hint, visualType, visualData, extra) =>
      makeProblem(`g4-ma-${id}`, 4, "算数", type, q, a, answers || [a], exp, hint, visualType, visualData, extra);
    const math = [
      ...[
        ["div-1",["色紙 96枚を4人で同じ数ずつ分ける","式 96÷4"],"一人分の枚数を答えましょう。","24枚",["24枚","24"],"96÷4=24です。"],["div-2",["本 156冊を3つの棚に同じ数ずつ入れる","式 156÷3"],"一つの棚に入る冊数を答えましょう。","52冊",["52冊","52"],"156÷3=52です。"],["div-3",["208この豆を8袋に同じ数ずつ入れる","式 208÷8"],"一袋分の数を答えましょう。","26こ",["26こ","26"],"208÷8=26です。"],["div-4",["315mの道を5日で同じ長さずつ調べる","式 315÷5"],"一日分の長さを答えましょう。","63m",["63m","63"],"315÷5=63です。"],["div-5",["432枚のカードを6箱に同じ数ずつ入れる","式 432÷6"],"一箱分の枚数を答えましょう。","72枚",["72枚","72"],"432÷6=72です。"],["div-6",["728円を7人で同じ額ずつ出す","式 728÷7"],"一人分の金額を答えましょう。","104円",["104円","104"],"728÷7=104です。"]
      ].map((x) => m(x[0], "input", x[2], x[3], x[4], x[5], "わり算の式と場面を対応させます。", "readingCard", { title: "わり算の場面", lines: x[1] })),
      ...[
        ["dec-1",["ジュース0.7Lと水0.5Lを合わせる"],"全部の量を小数で答えましょう。","1.2L",["1.2L","1.2"],"0.7+0.5=1.2です。"],["dec-2",["リボン1.6mと2.8mをつなぐ"],"全体の長さを答えましょう。","4.4m",["4.4m","4.4"],"1.6+2.8=4.4です。"],["dec-3",["5.3kgの箱から1.7kg取り出す"],"残りの重さを答えましょう。","3.6kg",["3.6kg","3.6"],"5.3-1.7=3.6です。"],["dec-4",["8.0Lの水から2.45L使う"],"残りの水の量を答えましょう。","5.55L",["5.55L","5.55"],"8.00-2.45=5.55です。"],["dec-5",["0.24km歩き、さらに0.36km歩く"],"歩いた道のりを答えましょう。","0.6km",["0.6km","0.6"],"0.24+0.36=0.60です。"],["dec-6",["2.4mの布を3本使う"],"使う布の長さを答えましょう。","7.2m",["7.2m","7.2"],"2.4×3=7.2です。"]
      ].map((x) => m(x[0], "input", x[2], x[3], x[4], x[5], "小数点の位置をそろえます。", "readingCard", { title: "小数の場面", lines: x[1] })),
      ...[
        ["frac-1",["同じ大きさのピザを4等分","食べた量 1/4 と 2/4"],"合わせた量を分数で答えましょう。","3/4",["3/4"],"分母が同じなので分子を足します。"],["frac-2",["水そうの水 3/5L","さらに 1/5L 入れる"],"水の量を答えましょう。","4/5",["4/5"],"3/5+1/5=4/5です。"],["frac-3",["テープ 5/6m","2/6m 使った"],"残りを答えましょう。","3/6",["3/6","1/2"],"5/6-2/6=3/6です。"],["frac-4",["1/3と同じ長さになるように6等分の目盛りで表す"],"同じ大きさの分数を選びましょう。","2/6",null,"1/3は2/6と同じ大きさです。",["2/6","3/6","1/6","5/6"]],["frac-5",["2/8mのリボンを同じ大きさで簡単に表す"],"約分した分数を答えましょう。","1/4",["1/4"],"2/8は1/4に約分できます。"],["frac-6",["3/10Lと4/10Lを合わせる"],"合わせた量を答えましょう。","7/10",["7/10"],"分子を足して7/10です。"]
      ].map((x) => m(x[0], x[6] ? "choice" : "input", x[2], x[3], x[4], x[5], "図の等分を思い浮かべます。", "readingCard", { title: "分数カード", lines: x[1] }, x[6] ? { choices: x[6] } : {})),
      ...[
        ["area-1","花だん",8,6,"48平方cm"],["area-2","カード",9,4,"36平方cm"],["area-3","掲示板",12,5,"60平方cm"],["area-4","広場",10,10,"100平方m"],["area-5","畑",6,11,"66平方m"],["area-6","工作用紙",15,3,"45平方cm"]
      ].map((x) => m(x[0], "input", `図の${x[1]}の面積を答えましょう。`, x[4], [x[4], x[4].replace("平方","")], `たて×横で、${x[4]}です。`, "たてと横をかけます。", "shape", { label: x[1], shapes: [{ kind: "rect", x: 105, y: 75, w: 210, h: 120, color: "#eaf4ff" }, { label: `たて${x[2]}`, x: 170, y: 62 }, { label: `横${x[3]}`, x: 310, y: 140 }] })),
      ...[
        ["angle-1",["三角定規の直角を使って角を調べた","ぴったり重なった"],"この角の大きさを答えましょう。","90度",["90度","90"],"直角は90度です。"],["angle-2",["30度の角と60度の角を合わせる"],"できる角の大きさを答えましょう。","90度",["90度","90"],"30+60=90です。"],["angle-3",["120度の角から30度分を取り除く"],"残りの角の大きさを答えましょう。","90度",["90度","90"],"120-30=90です。"],["angle-4",["半回転した線が作るまっすぐな角"],"角の大きさを選びましょう。","180度",null,"半回転の角は180度です。",["180度","90度","45度","360度"]]
      ].map((x) => m(x[0], x[6] ? "choice" : "input", x[2], x[3], x[4], x[5], "直角をもとに考えます。", "readingCard", { title: "角のカード", lines: x[1] }, x[6] ? { choices: x[6] } : {})),
      ...[
        ["graph-1",["月","火","水","木"],[8,12,9,15],"一番多い曜日","木"],["graph-2",["A","B","C","D"],[24,18,30,12],"30を表す棒","C"],["graph-3",["1組","2組","3組"],[16,21,19],"一番少ない組","1組"],["graph-4",["春","夏","秋","冬"],[7,13,10,5],"夏と冬の差","8"],["graph-5",["本","ノート","鉛筆"],[40,25,35],"全部の数","100"],["graph-6",["東","西","南","北"],[11,17,14,10],"西は北よりいくつ多い","7"]
      ].map((x) => m(x[0], "input", `棒グラフを見て、「${x[3]}」に答えましょう。`, x[4], [x[4]], `棒の高さを比べると、答えは${x[4]}です。`, "棒の上の数を見ます。", "barGraph", { labels: x[1], values: x[2] })),
      ...[
        ["word-1",["1冊80円のノートを6冊買う","80×6"],"代金を答えましょう。","480円",["480円","480"],"80×6=480です。"],["word-2",["24このクッキーを4人で同じ数ずつ分ける","24÷4"],"一人分を答えましょう。","6こ",["6こ","6"],"24÷4=6です。"],["word-3",["96ページの本を1日12ページずつ読む","96÷12"],"読み終わる日数を答えましょう。","8日",["8日","8"],"96÷12=8です。"],["word-4",["リボンを2.4mずつ3本切る","2.4×3"],"使う長さを答えましょう。","7.2m",["7.2m","7.2"],"2.4×3=7.2です。"],["word-5",["48本の花を6本ずつ束にする","48÷6"],"できる束の数を答えましょう。","8束",["8束","8"],"48÷6=8です。"],["word-6",["3.5Lの水を4本分集める","3.5×4"],"全部の量を答えましょう。","14L",["14L","14"],"3.5×4=14です。"]
      ].map((x) => m(x[0], "input", x[2], x[3], x[4], x[5], "場面に合う式を見て計算します。", "readingCard", { title: "文章題", lines: x[1] })),
      ...[
        ["formula-1",["1個80円の品物をx個買う","代金を式で表す"],"式を書きましょう。","80×x",["80×x","80*x"],"一個の値段×個数です。"],["formula-2",["全部でa個のあめを4人で同じ数ずつ分ける"],"一人分を表す式を書きましょう。","a÷4",["a÷4","a/4"],"全部の数を4で割ります。"],["formula-3",["たて6cm、横xcmの長方形"],"面積を表す式を書きましょう。","6×x",["6×x","6*x"],"長方形の面積はたて×横です。"],["formula-4",["1本2.5Lの水をx本集める"],"全部の量を表す式を書きましょう。","2.5×x",["2.5×x","2.5*x"],"一つ分×いくつ分です。"],["formula-5",["家から学校までx m、学校から公園まで120m"],"合わせた道のりを式で書きましょう。","x+120",["x+120","120+x"],"二つの道のりを足します。"],["formula-6",["1mのテープからx cm使った"],"残りをcmで表す式を書きましょう。","100-x",["100-x"],"1mは100cmです。"]
      ].map((x) => m(x[0], "input", x[2], x[3], x[4], x[5], "何が一つ分か、全体かを見ます。", "readingCard", { title: "式のカード", lines: x[1] })),
      ...[
        ["mix-1",["Aコース 1.8km","Bコース 2.4km"],"BコースはAコースより何km長いですか。","0.6km",["0.6km","0.6"],"2.4-1.8=0.6です。"],
        ["mix-2",["長方形の花だん 面積72平方m","たて8m"],"横の長さを答えましょう。","9m",["9m","9"],"72÷8=9です。"],
        ["mix-3",["表: 月 15こ / 火 18こ / 水 21こ"],"月から水までに増えた数を答えましょう。","6こ",["6こ","6"],"21-15=6です。"],
        ["mix-4",["1本120円のペンをx本買う","500円出す"],"おつりを表す式を書きましょう。","500-120×x",["500-120×x","500-120*x"],"代金120×xを500円から引きます。"]
      ].map((x) => m(x[0], "input", x[2], x[3], x[4], x[5], "図や表から必要な数を選びます。", "readingCard", { title: "応用カード", lines: x[1] }))
    ];
    return ja.concat(math).map(withBetterHint);
  }

  function withBetterHint(problem) {
    return Object.assign({}, problem, { hint: betterHintFor(problem) });
  }

  function betterHintFor(problem) {
    const id = problem.id;
    const isGrade1 = problem.grade === 1;
    const isJapanese = problem.subject === "国語";
    let hint = "";

    if (isGrade1) return betterGrade1HintFor(problem);

    if (isJapanese) {
      if (id.includes("-pic-")) hint = "えと せつめいを 見くらべて、なまえを 考えましょう。";
      else if (id.includes("-story-")) hint = "文章の中の「だれが」「なにをした」を さがしましょう。";
      else if (id.includes("-notice-")) hint = "おしらせの中の、時こく・もちもの・ばしょに 注目しましょう。";
      else if (id.includes("-sentence-")) hint = "文の前と後ろを読んで、自然につながることばを考えましょう。";
      else if (id.includes("-dialog-") || id.includes("-comic-")) hint = "登場人物の言ったことを、もう一度読みましょう。";
      else if (id.includes("-order-")) hint = "番号のじゅんばんを見て、先にすること・後にすることを考えましょう。";
      else if (id.includes("-letter-")) hint = "手紙の中で、相手に伝えていることをさがしましょう。";
      else if (id.includes("-diary-")) hint = "日記の中で、できごとや気もちが書かれた文を見ましょう。";
      else if (id.includes("-read-")) hint = "前の文と次の文を読み比べ、行動と結果をつなげましょう。";
      else if (id.includes("-kanji-")) hint = "（　）の前後の文を読んで、場面に合う漢字を考えましょう。";
      else if (id.includes("-data-")) hint = "資料の見出し・数・場所・目的が書かれた部分を見つけましょう。";
      else if (id.includes("-comp-")) hint = "（　）の前後を読み、理由・目的・反対のつながりを考えましょう。";
      else if (id.includes("-sum-")) hint = "文章全体で、はじめと終わりに何が変わったかを見ましょう。";
      else if (id.includes("-paper-")) hint = "見出しや本文の中から、条件や目的が書かれたところを探しましょう。";
      else hint = "本文や資料の中から、答えの手がかりになる文を探しましょう。";
    } else {
      if (id.includes("-count-")) hint = "まず全部でいくつあるか、ひとつずつ数えましょう。";
      else if (id.includes("-add-")) hint = "ふえる場面です。はじめの数に、ふえた数を合わせましょう。";
      else if (id.includes("-sub-")) hint = "へる場面です。全部の数から、なくなった分を引きましょう。";
      else if (id.includes("-line-")) hint = "数直線を左から見て、印のある目もりを読みましょう。";
      else if (id.includes("-clock-")) hint = "時計の長い針を見てから、短い針の位置を見ましょう。";
      else if (id.includes("-shape-")) hint = "図の同じ形や、辺・かどの数に注目しましょう。";
      else if (id.includes("-money-")) hint = "お金の種類ごとに金額をたして考えましょう。";
      else if (id.includes("-len-")) hint = "二つの数を比べて、大きい方を選びましょう。";
      else if (id.includes("-num-")) hint = "10のまとまりや、数の分け方を図で考えましょう。";
      else if (id.includes("-table-")) hint = "表の中から必要な二つの数を選んで計算しましょう。";
      else if (id.includes("-div-")) hint = "同じ数ずつ分ける場面なので、わり算の式を使いましょう。";
      else if (id.includes("-dec-")) hint = "小数点の位置をそろえて、たし算・ひき算をしましょう。";
      else if (id.includes("-frac-")) hint = "同じ大きさに分けた図を思いうかべ、分母を見ましょう。";
      else if (id.includes("-area-")) hint = "長方形や正方形は、たてと横の長さを使って考えましょう。";
      else if (id.includes("-angle-")) hint = "直角をもとにして、たす角・ひく角を考えましょう。";
      else if (id.includes("-graph-")) hint = "棒の高さと、棒の上の数を見比べましょう。";
      else if (id.includes("-word-")) hint = "場面の中で、一つ分・いくつ分・全部のどれを求めるか考えましょう。";
      else if (id.includes("-formula-")) hint = "分かっている数と文字が、それぞれ何を表すか見ましょう。";
      else if (id.includes("-mix-")) hint = "図や表から必要な数だけを選び、どんな計算か決めましょう。";
      else hint = "図や表の数を見て、どんな計算を使うか考えましょう。";
    }

    return hint;
  }

  function betterGrade1HintFor(problem) {
    const id = problem.id;
    if (problem.subject === "国語") {
      if (id.includes("-pic-")) return "えとせつめいをみくらべて、なまえをかんがえましょう。";
      if (id.includes("-story-")) return "ぶんのなかの「だれが」「なにをした」をさがしましょう。";
      if (id.includes("-notice-")) return "おしらせの、じこく・もちもの・ばしょをみましょう。";
      if (id.includes("-sentence-")) return "まえのぶんとうしろのぶんを、こえにだしてよみましょう。";
      if (id.includes("-dialog-") || id.includes("-comic-")) return "ふきだしのことばを、もういちどよみましょう。";
      if (id.includes("-order-")) return "ばんごうのじゅんばんをみましょう。";
      if (id.includes("-letter-")) return "てがみでつたえていることをさがしましょう。";
      if (id.includes("-diary-")) return "にっきのできごとや、きもちをさがしましょう。";
      return "カードのなかのことばを、ゆっくりよみましょう。";
    }
    if (id.includes("-count-")) return "ひとつずつ、ゆびでさしてかぞえましょう。";
    if (id.includes("-add-")) return "はじめのかずに、ふえたかずをあわせましょう。";
    if (id.includes("-sub-")) return "ぜんぶのかずから、へったぶんをひきましょう。";
    if (id.includes("-line-")) return "すうじのせんを、ひだりからみましょう。";
    if (id.includes("-clock-")) return "ながいはりをみてから、みじかいはりをみましょう。";
    if (id.includes("-shape-")) return "かどのかずや、せんのようすをみましょう。";
    if (id.includes("-money-")) return "おなじおかねをまとめて、たしましょう。";
    if (id.includes("-len-")) return "ふたつのかずをくらべましょう。";
    if (id.includes("-num-")) return "10のまとまりと、ばらのかずをみましょう。";
    if (id.includes("-table-")) return "ひょうのなかのかずを、ふたつみつけましょう。";
    return "ずやひょうのかずをみて、けいさんをきめましょう。";
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

  function splitJapaneseLine(text) {
    const parts = String(text).split(/(?<=。)/).filter(Boolean);
    const lines = [];
    parts.forEach((part) => {
      if (part.length <= 24) {
        lines.push(part);
      } else {
        lines.push(part.slice(0, 24));
        lines.push(part.slice(24));
      }
    });
    return lines;
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
      case "readingCard": return renderReadingCard(data);
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

  function renderReadingCard(data) {
    const lines = (data.lines || []).slice(0, 8);
    const height = Math.max(170, 82 + lines.length * 34);
    return `<svg viewBox="0 0 560 ${height}" role="img" aria-label="読むカード">
      <rect x="18" y="18" width="524" height="${height - 36}" rx="10" fill="#fff" stroke="#2f80ed" stroke-width="5"/>
      <rect x="18" y="18" width="524" height="46" rx="10" fill="#eaf4ff" stroke="#2f80ed" stroke-width="5"/>
      <text x="42" y="49" font-size="22" font-weight="900" fill="#18324a">${escapeHtml(data.title || "よむもの")}</text>
      ${lines.map((line, i) => `<text x="42" y="${98 + i * 34}" font-size="${data.small ? 18 : 20}" font-weight="${data.bold ? 800 : 650}" fill="#18324a">${escapeHtml(line)}</text>`).join("")}
      ${data.note ? `<text x="42" y="${height - 24}" font-size="16" fill="#60748a">${escapeHtml(data.note)}</text>` : ""}
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
