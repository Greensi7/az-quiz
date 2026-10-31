/* AZ / play. No dependencies, network calls, or credentials. */
(function () {
  "use strict";

  const ROWS = 7;
  const TILE_COUNT = 28;
  const STORAGE_KEY = "az-play.game.v1";
  const MAX_TEXT = 1000000;
  const MAX_FIELD = 20000;
  const MAX_BANK = 5000;
  const SAMPLE_TEXT = `What is the capital of Czechia?;Prague
Which planet is known as the Red Planet?;Mars
How many sides does a hexagon have?;6
Which river flows through Prague?;The Vltava
What is the chemical symbol for gold?;Au
Who wrote Romeo and Juliet?;William Shakespeare
What is the largest ocean on Earth?;The Pacific Ocean
How many minutes are in three hours?;180
What gas do plants absorb during photosynthesis?;Carbon dioxide
Which country is home to the city of Kyoto?;Japan
What is the square root of 144?;12
Which musical instrument usually has 88 keys?;A piano
What is the tallest mountain above sea level?;Mount Everest
How many players does one football team have on the pitch at the start of a match?;11
Which organ pumps blood around the human body?;The heart
What is the smallest prime number?;2
Who painted the Mona Lisa?;Leonardo da Vinci
How many bones are in a typical adult human skeleton?;206
What language is primarily spoken in Brazil?;Portuguese
In what year did humans first land on the Moon?;1969
What is the largest planet in our solar system?;Jupiter
Which Czech writer wrote The Metamorphosis?;Franz Kafka
What do bees collect from flowers to make honey?;Nectar
How many degrees are in a right angle?;90
Which continent is the Sahara Desert in?;Africa
What is the main ingredient in guacamole?;Avocado
Which element has the chemical symbol O?;Oxygen
What is the name of the galaxy containing our solar system?;The Milky Way`;

  const POSITIONS = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col <= row; col++) POSITIONS.push({ row, col });
  }
  const indexAt = (row, col) => row < 0 || row >= ROWS || col < 0 || col > row ? -1 : row * (row + 1) / 2 + col;
  const NEIGHBORS = POSITIONS.map(({ row, col }) => [
    [row, col - 1], [row, col + 1], [row - 1, col - 1],
    [row - 1, col], [row + 1, col], [row + 1, col + 1]
  ].map(([r, c]) => indexAt(r, c)).filter(index => index >= 0));
  const otherPlayer = player => player === "red" ? "blue" : "red";
  const playerName = player => player === "red" ? "Red" : "Blue";

  // A small semicolon CSV reader. Quoted fields can contain newlines,
  // semicolons and doubled quotes. A malformed record blocks the whole import.
  function parseSimple(text) {
    const records = [], errors = [];
    let fields = [], field = "", quoted = false, closedQuote = false;
    let line = 1, startLine = 1, recordError = false;
    function finishField() { fields.push(field.trim()); field = ""; closedQuote = false; }
    function finishRecord() {
      finishField();
      if (fields.some(Boolean) || fields.length > 1) {
        if (recordError) errors.push(`Line ${startLine}: unexpected text after a closing quote.`);
        else if (fields.length !== 2) errors.push(`Line ${startLine}: expected Question;Answer. Quote fields that contain semicolons.`);
        else if (!fields[0] || !fields[1]) errors.push(`Line ${startLine}: both the question and answer must contain text.`);
        else records.push({ question: fields[0], answer: fields[1], choices: [], explanation: "" });
      }
      fields = []; recordError = false; startLine = line + 1;
    }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else { quoted = false; closedQuote = true; }
        } else { field += char; if (char === "\n") line++; }
      } else if (char === ";") finishField();
      else if (char === "\n") { finishRecord(); line++; }
      else if (char === '"' && !field.trim() && !closedQuote) { field = ""; quoted = true; }
      else if (closedQuote) { if (!/\s/.test(char)) recordError = true; }
      else field += char;
    }
    if (quoted) errors.push(`Line ${startLine}: an opening quote has no closing quote.`);
    else finishRecord();
    return { questions: records, errors, warnings: [], format: "Question;Answer" };
  }

  function parseDrill(text) {
    const errors = [], warnings = [], questions = [];
    let metadata = {};
    const optionsStart = /^[ \t]*<options>/m.exec(text);
    if (optionsStart) {
      const rawOptions = text.slice(optionsStart.index).replace(/^[ \t]*<options>\s*/, "").trim();
      try {
        metadata = JSON.parse(rawOptions);
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Invalid options");
      } catch (_) { errors.push("The trailing Drill 2 <options> block must contain valid JSON."); }
      text = text.slice(0, optionsStart.index);
      warnings.push("Drill 2 settings and custom graders are ignored. Formatting is shown as plain text.");
    }
    const blocks = [];
    let lines = [], start = 1;
    text.split("\n").forEach((line, i) => {
      if (!line.trim()) { if (lines.length) blocks.push({ lines, start }); lines = []; }
      else { if (!lines.length) start = i + 1; lines.push(line); }
    });
    if (lines.length) blocks.push({ lines, start });
    for (const block of blocks) {
      const questionLines = [], choices = [];
      for (const line of block.lines) {
        const match = /^\s*(>*)\s*([A-Za-z])\)\s*(.*)$/.exec(line);
        if (match) choices.push({ label: match[2].toUpperCase(), text: match[3].trim(), correct: !!match[1] });
        else if (choices.length) choices[choices.length - 1].text += "\n" + line.trim();
        else questionLines.push(line.trim());
      }
      let question = questionLines.join("\n").trim();
      const id = /^\[#(\d+)\]\s*/.exec(question);
      if (id) question = question.slice(id[0].length).trim();
      if (!question || choices.length < 2 || choices.some(choice => !choice.text.trim()) || !choices.some(choice => choice.correct)) {
        errors.push(`Line ${block.start}: each Drill 2 block needs a question, at least two A) choices, and a correct choice marked with > or >>>.`);
        continue;
      }
      const explanation = id && metadata.explanations && typeof metadata.explanations[id[1]] === "string" ? metadata.explanations[id[1]] : "";
      questions.push({ question, choices, answer: choices.filter(choice => choice.correct).map(choice => `${choice.label}) ${choice.text}`).join("\n"), explanation });
    }
    return { questions, errors, warnings, format: "Drill 2" };
  }

  function validQuestion(item) {
    return !!item && typeof item.question === "string" && !!item.question.trim() && item.question.length <= MAX_FIELD &&
      typeof item.answer === "string" && !!item.answer.trim() && item.answer.length <= MAX_FIELD &&
      typeof item.explanation === "string" && item.explanation.length <= MAX_FIELD &&
      Array.isArray(item.choices) && item.choices.length <= 100 && item.choices.every(choice =>
        choice && typeof choice.text === "string" && !!choice.text.trim() && choice.text.length <= MAX_FIELD &&
        typeof choice.label === "string" && /^[A-Z]$/.test(choice.label) && typeof choice.correct === "boolean") &&
      (!item.choices.length || (item.choices.length >= 2 && item.choices.some(choice => choice.correct)));
  }

  function parseQuestions(raw, format = "auto") {
    if (typeof raw !== "string" || raw.length > MAX_TEXT) return { questions: [], errors: ["Use a question bank smaller than 1,000,000 characters."], warnings: [], format: "" };
    const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const isDrill = format === "drill" || (format === "auto" && /^\s*>+\s*[A-Za-z]\)/m.test(text));
    const result = isDrill ? parseDrill(text) : parseSimple(text);
    if (result.questions.some(question => !validQuestion(question))) result.errors.push("A question has an empty field, over 100 choices, or a field longer than 20,000 characters.");
    const unique = new Map();
    for (const question of result.questions) unique.set(JSON.stringify(question), question);
    if (unique.size < result.questions.length) result.warnings.push(`${result.questions.length - unique.size} exact duplicate question(s) removed.`);
    result.questions = Array.from(unique.values());
    if (result.questions.length > MAX_BANK) result.errors.push(`Use at most ${MAX_BANK} questions per bank.`);
    return result;
  }

  function shuffle(items, random = Math.random) {
    const shuffled = items.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function createGame(bank, random) {
    if (!Array.isArray(bank) || bank.length < TILE_COUNT || bank.length > MAX_BANK || !bank.every(validQuestion)) throw new Error("A valid bank of at least 28 questions is required.");
    return { version: 1, bank, tiles: shuffle(bank, random).slice(0, TILE_COUNT).map(question => ({ question, owner: null })), currentPlayer: "red", selected: null, revealed: false, turn: 1, winner: null, winningTiles: [], message: "Red goes first. Pick any open tile to begin." };
  }

  // Each connected component gets a side bitmask: left=1, right=2, bottom=4.
  // Only one component touching all three sides (mask=7) is a winning route.
  function findConnection(tiles, player) {
    const visited = new Set();
    for (let start = 0; start < TILE_COUNT; start++) {
      if (visited.has(start) || tiles[start].owner !== player) continue;
      const stack = [start], component = [];
      let sides = 0;
      visited.add(start);
      while (stack.length) {
        const index = stack.pop(), { row, col } = POSITIONS[index];
        component.push(index);
        if (col === 0) sides |= 1;
        if (col === row) sides |= 2;
        if (row === ROWS - 1) sides |= 4;
        for (const neighbor of NEIGHBORS[index]) {
          if (!visited.has(neighbor) && tiles[neighbor].owner === player) { visited.add(neighbor); stack.push(neighbor); }
        }
      }
      if (sides === 7) return component;
    }
    return [];
  }

  function canClaim(game, index, player = game.currentPlayer) {
    return game.tiles[index]?.owner === "neutral" &&
      (!game.tiles.some(tile => tile.owner === player) || NEIGHBORS[index].some(neighbor => game.tiles[neighbor].owner === player));
  }

  function hasMove(game, player) {
    return game.tiles.some((tile, index) => tile.owner === null || canClaim(game, index, player));
  }

  function applyMove(game, action) {
    if (!game || game.winner || !Number.isInteger(game.selected)) return false;
    const index = game.selected, tile = game.tiles[index], player = game.currentPlayer;
    if (action === "claim") {
      if (!canClaim(game, index)) return false;
      tile.owner = player;
    } else if ((action === "correct" || action === "wrong") && tile.owner === null && game.revealed) {
      tile.owner = action === "correct" ? player : "neutral";
    } else return false;
    game.selected = null;
    game.revealed = false;
    const connection = findConnection(game.tiles, player);
    game.message = `${playerName(player)} ${action === "wrong" ? "missed" : "claimed"} tile ${index + 1}.`;
    if (connection.length) {
      game.winner = player; game.winningTiles = connection;
      game.message = `${playerName(player)} connected all three sides and wins!`;
    } else {
      game.turn++;
      game.currentPlayer = otherPlayer(player);
      if (!hasMove(game, game.currentPlayer)) {
        if (hasMove(game, player)) {
          game.message += ` ${playerName(game.currentPlayer)} has no legal move and passes.`;
          game.currentPlayer = player;
        } else { game.winner = "draw"; game.message = "Neither player has a legal move. This match is a draw."; }
      }
    }
    return true;
  }

  function validateSavedGame(game) {
    if (!game || game.version !== 1 || !Array.isArray(game.bank) || game.bank.length < TILE_COUNT || game.bank.length > MAX_BANK || !game.bank.every(validQuestion) ||
      !Array.isArray(game.tiles) || game.tiles.length !== TILE_COUNT || !game.tiles.every(tile => tile && validQuestion(tile.question) && [null, "neutral", "red", "blue"].includes(tile.owner)) ||
      !["red", "blue"].includes(game.currentPlayer) || !Number.isInteger(game.turn) || game.turn < 1 || game.turn > 57 ||
      !(game.selected === null || (Number.isInteger(game.selected) && game.selected >= 0 && game.selected < TILE_COUNT)) || typeof game.revealed !== "boolean" ||
      ![null, "red", "blue", "draw"].includes(game.winner) || typeof game.message !== "string" || game.message.length > 1000) return false;
    if (game.selected !== null && ![null, "neutral"].includes(game.tiles[game.selected].owner)) return false;
    if (game.revealed && (game.selected === null || game.tiles[game.selected].owner !== null)) return false;
    const redWin = findConnection(game.tiles, "red"), blueWin = findConnection(game.tiles, "blue");
    if (redWin.length && blueWin.length) return false;
    const actualWinner = redWin.length ? "red" : blueWin.length ? "blue" : !hasMove(game, "red") && !hasMove(game, "blue") ? "draw" : null;
    if (game.winner !== actualWinner || (game.winner && game.selected !== null)) return false;
    if (!game.winner && !hasMove(game, game.currentPlayer)) return false;
    game.winningTiles = redWin.length ? redWin : blueWin;
    return true;
  }

  const engine = { ROWS, TILE_COUNT, STORAGE_KEY, SAMPLE_TEXT, POSITIONS, NEIGHBORS, parseQuestions, shuffle, createGame, findConnection, canClaim, hasMove, applyMove, validateSavedGame };
  // The same dependency-free engine is exercised by tests using Node's built-in runner.
  if (typeof module !== "undefined" && module.exports) module.exports = engine;
  if (typeof document === "undefined") return;

  const $ = id => document.getElementById(id);
  let game = null, parsed = parseQuestions(""), parseTimer, noticeTimer, confirmAction;
  let storageWorking = true;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, className, handler) {
    const node = el("button", className, text); node.type = "button"; node.addEventListener("click", handler); return node;
  }
  function notify(message, warning = false) {
    clearTimeout(noticeTimer);
    $("notice").textContent = message; $("notice").classList.toggle("is-warning", warning); $("notice").hidden = false;
    noticeTimer = setTimeout(() => { $("notice").hidden = true; }, warning ? 10000 : 5500);
  }
  function persist() {
    try {
      if (game) localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
      else localStorage.removeItem(STORAGE_KEY);
      storageWorking = true;
    } catch (_) {
      if (storageWorking) notify("Browser storage is unavailable or full. This match will work, but progress may not be saved.", true);
      storageWorking = false;
    }
    $("save-status").textContent = storageWorking ? "✓ Saved on this browser · no account needed" : "Progress is not being saved. Keep this page open.";
  }
  function validateImport() {
    parsed = parseQuestions($("questions").value, $("import-format").value);
    const count = parsed.questions.length;
    $("question-count").textContent = `${count} question${count === 1 ? "" : "s"} detected`;
    $("start-button").disabled = count < TILE_COUNT || parsed.errors.length > 0;
    $("questions").setAttribute("aria-invalid", String(parsed.errors.length > 0));
    const messages = [];
    if (parsed.errors.length) {
      messages.push(...parsed.errors.slice(0, 3));
      if (parsed.errors.length > 3) messages.push(`…and ${parsed.errors.length - 3} more issue(s).`);
    } else if (count >= TILE_COUNT) messages.push(`${count} questions ready · ${parsed.format}${count > TILE_COUNT ? " · 28 picked at random" : ""}`);
    else if ($("questions").value.trim()) messages.push(`Add ${TILE_COUNT - count} more valid questions to fill the board.`);
    messages.push(...parsed.warnings);
    $("import-status").textContent = messages.join("\n");
    $("import-status").classList.toggle("has-errors", parsed.errors.length > 0);
  }

  function renderBoard() {
    const fragment = document.createDocumentFragment();
    for (let row = 0; row < ROWS; row++) {
      const rowNode = el("div", "board-row");
      for (let col = 0; col <= row; col++) {
        const index = indexAt(row, col), owner = game?.tiles[index].owner;
        const tile = button(String(index + 1).padStart(2, "0"), "hex", () => selectTile(index));
        tile.dataset.index = String(index);
        tile.disabled = !game || !!game.winner || owner === "red" || owner === "blue" || (game.selected !== null && game.tiles[game.selected].owner === null && game.selected !== index);
        if (owner) tile.classList.add(`is-${owner}`);
        if (game && canClaim(game, index)) tile.classList.add("is-eligible");
        if (game?.selected === index) tile.classList.add("is-selected");
        if (game?.winningTiles.includes(index)) tile.classList.add("is-winning");
        let description = owner ? owner === "neutral" ? "neutral" : `claimed by ${playerName(owner)}` : "open";
        if (owner === "neutral" && game) description += canClaim(game, index) ? ", eligible to claim" : ", not adjacent to your tiles";
        tile.setAttribute("aria-label", `Tile ${index + 1}, ${description}, row ${row + 1}, column ${col + 1}`);
        tile.setAttribute("aria-pressed", String(game?.selected === index));
        if (owner === "red" || owner === "blue" || owner === "neutral") tile.append(el("span", "tile-symbol", owner === "red" ? "●" : owner === "blue" ? "◆" : "–"));
        rowNode.append(tile);
      }
      fragment.append(rowNode);
    }
    $("board").replaceChildren(fragment);
    for (const player of ["red", "blue"]) {
      const count = game ? game.tiles.filter(tile => tile.owner === player).length : 0;
      $(`${player}-score`).textContent = String(count).padStart(2, "0");
      $(`${player}-player`).classList.toggle("is-active", !!game && (game.winner === player || (!game.winner && game.currentPlayer === player)));
      $(`${player}-status`).textContent = !game ? "Ready to play" : game.winner === player ? "Connected all 3 sides!" : game.winner ? "Match complete" : game.currentPlayer === player ? "Your turn" : "Up next";
    }
    $("round-label").textContent = !game ? "YOUR NEXT GREAT MATCH" : game.winner ? "MATCH COMPLETE" : `TURN ${String(game.turn).padStart(2, "0")}`;
    $("board-count").textContent = game ? `${game.tiles.filter(tile => tile.owner === null).length} OPEN · 28 TILES` : "28 TILES · 3 SIDES";
    $("board-note").textContent = game ? game.message : "↗ Your route to victory starts with a good question.";
  }

  function selectTile(index) {
    if (!game || game.winner || ![null, "neutral"].includes(game.tiles[index].owner)) return;
    if (game.selected !== null && game.tiles[game.selected].owner === null) return;
    game.selected = index; game.revealed = false;
    persist(); render(); focusPanel();
  }
  function focusPanel() {
    $("turn-heading").focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 760px)").matches) $("play-panel").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }
  function commitMove(action) {
    if (!applyMove(game, action)) return;
    persist(); render(); $("announcement").textContent = `${game.message} ${game.winner ? "" : playerName(game.currentPlayer) + "’s turn."}`;
    if (game.winner) focusPanel();
    else {
      const next = $("board").querySelector("button:not(:disabled)");
      next?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 760px)").matches) $("board-heading").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    }
  }
  function renderPlay() {
    const player = playerName(game.currentPlayer), content = $("turn-content");
    content.replaceChildren();
    $("play-panel").dataset.player = game.currentPlayer;
    $("turn-symbol").textContent = game.currentPlayer === "red" ? "●" : "◆";
    $("turn-label").textContent = game.winner ? "THAT’S A CONNECTION" : `${player.toUpperCase()}’S TURN`;
    $("turn-number").textContent = `TURN ${String(game.turn).padStart(2, "0")}`;
    $("turn-heading").textContent = game.winner ? game.winner === "draw" ? "An even match." : `${playerName(game.winner)} takes the win.` : `Your move, ${player}.`;
    $("turn-description").textContent = game.winner ? "A little knowledge goes a long way." : game.selected === null ? "Pick an open tile. Make it yours." : "Answer aloud. Let your opponent be the judge.";
    if (game.winner) {
      const card = el("div", "winner-card");
      card.append(el("div", "winner-art", game.winner === "draw" ? "=" : "✳"), el("h3", "", game.winner === "draw" ? "Call it a draw." : "Beautifully connected."), el("p", "", game.winner === "draw" ? "Neither player has a legal move left. Time for a fresh board?" : "One connected territory. All three sides. The highlighted tiles tell the story."), button("Play a rematch ↗", "button primary", () => askConfirm("restart")));
      content.append(card); return;
    }
    if (game.selected === null) {
      const empty = el("div", "empty-turn");
      empty.append(el("span", "empty-hex", "⬡"), el("h3", "", "Every connection starts somewhere."), el("p", "", "Choose a numbered hexagon on the board."));
      const tip = el("div", "turn-tip");
      tip.append(el("span", "", "↗"), el("p", "", "Think beyond the next answer. Build one connected group that reaches the left, right and bottom edges."));
      content.append(empty, tip); return;
    }
    const tile = game.tiles[game.selected], question = tile.question;
    content.append(el("p", "question-meta", `TILE ${String(game.selected + 1).padStart(2, "0")} / ${tile.owner === "neutral" ? "NEUTRAL TERRITORY" : question.choices.length ? "MULTIPLE CHOICE" : "THE QUESTION"}`));
    if (tile.owner === "neutral") {
      const eligible = canClaim(game, game.selected), card = el("div", "neutral-card");
      card.append(el("h3", "", eligible ? "An opening in the board." : "Just out of reach."), el("p", "", eligible ? `Claim this neutral tile for ${player}. This uses your turn; there’s no new question.` : "To claim this tile, first own a tile next to it. You can choose a different tile without using your turn."));
      const claim = button(`Claim for ${player} ${game.currentPlayer === "red" ? "●" : "◆"}`, "button primary", () => commitMove("claim")); claim.disabled = !eligible;
      card.append(claim);
      content.append(card, button("← Choose another tile", "text-button", () => { game.selected = null; persist(); render(); })); return;
    }
    content.append(el("h3", "question-text", question.question));
    if (question.choices.length) {
      const list = el("ul", "choice-list");
      for (const choice of question.choices) {
        const item = el("li", game.revealed && choice.correct ? "is-answer" : "");
        item.append(el("span", "choice-label", choice.label + ")"), el("span", "", choice.text)); list.append(item);
      }
      content.append(list);
    }
    if (game.revealed) {
      const answer = el("div", "answer-box");
      answer.append(el("span", "eyebrow", "THE CORRECT ANSWER"), el("p", "answer-text", question.answer));
      if (question.explanation) answer.append(el("p", "explanation", question.explanation));
      content.append(answer);
    } else content.append(button("Reveal answer ↗", "button secondary reveal-button", () => { game.revealed = true; persist(); render(); $("announcement").textContent = "Answer: " + question.answer; $("correct-button").focus({ preventScroll: true }); }));
    const grade = el("div", "grade-actions");
    const correct = button("✓ Correct answer", "button correct-button", () => commitMove("correct"));
    correct.id = "correct-button";
    const wrong = button("× Wrong answer", "button wrong-button", () => commitMove("wrong"));
    correct.disabled = wrong.disabled = !game.revealed;
    grade.append(correct, wrong); content.append(grade, el("p", "judge-hint", game.revealed ? "Agree on the result, then pass the turn." : "Reveal the answer before recording the result."));
  }
  function render() {
    document.body.classList.toggle("is-playing", !!game);
    $("setup-panel").hidden = !!game; $("play-panel").hidden = !game;
    renderBoard(); if (game) renderPlay();
  }
  function startGame(bank) { game = createGame(bank); persist(); render(); $("announcement").textContent = "Match started. Red goes first."; $("board").querySelector("button").focus({ preventScroll: true }); if (window.matchMedia("(max-width: 760px)").matches) $("board-heading").scrollIntoView(); }
  function askConfirm(action) {
    confirmAction = action;
    $("confirm-title").textContent = action === "restart" ? "Another shot at glory?" : "Start with a new quiz?";
    $("confirm-description").textContent = action === "restart" ? "The current board will be cleared. We’ll shuffle your question bank again and let Red start." : "This clears the saved match and question bank from this browser. You’ll return to a blank setup.";
    $("confirm-action").textContent = action === "restart" ? "Restart match" : "Clear & start over";
    $("confirm-dialog").showModal();
  }

  $("questions").addEventListener("input", () => { $("start-button").disabled = true; clearTimeout(parseTimer); parseTimer = setTimeout(validateImport, 180); });
  $("import-format").addEventListener("change", validateImport);
  $("sample-button").addEventListener("click", () => { $("questions").value = SAMPLE_TEXT; $("import-format").value = "simple"; validateImport(); });
  $("setup-form").addEventListener("submit", event => { event.preventDefault(); clearTimeout(parseTimer); validateImport(); if (!parsed.errors.length && parsed.questions.length >= TILE_COUNT) startGame(parsed.questions); });
  $("help-button").addEventListener("click", () => $("help-dialog").showModal());
  document.querySelectorAll("[data-close]").forEach(node => node.addEventListener("click", () => $(node.dataset.close).close()));
  $("restart-button").addEventListener("click", () => askConfirm("restart"));
  $("reset-button").addEventListener("click", () => askConfirm("reset"));
  $("confirm-action").addEventListener("click", () => {
    $("confirm-dialog").close();
    if (confirmAction === "restart") startGame(game.bank);
    else { game = null; $("questions").value = ""; $("import-format").value = "auto"; persist(); validateImport(); render(); $("questions").focus(); }
  });
  // Browser tabs share a storage area. Apply changes from another tab rather than
  // pretending this is a networked game. No data leaves the browser.
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    try {
      const incoming = event.newValue ? JSON.parse(event.newValue) : null;
      if (incoming && !validateSavedGame(incoming)) return;
      game = incoming; render(); notify(incoming ? "The saved match was updated in another tab." : "The saved match was cleared in another tab.");
    } catch (_) { /* Ignore unrelated or malformed storage updates. */ }
  });
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const candidate = JSON.parse(saved);
        if (!validateSavedGame(candidate)) throw new Error("Invalid save");
        game = candidate; notify(game.winner ? "Your completed match has been restored." : "Welcome back. Your match is right where you left it.");
      } catch (_) { localStorage.removeItem(STORAGE_KEY); notify("The saved match could not be read. Start a new quiz to play.", true); }
    }
  } catch (_) { storageWorking = false; notify("Browser storage is unavailable. You can play, but progress will not survive a reload.", true); }
  $("save-status").textContent = storageWorking ? "✓ Saved on this browser · no account needed" : "Progress is not being saved. Keep this page open.";
  render();
})();
