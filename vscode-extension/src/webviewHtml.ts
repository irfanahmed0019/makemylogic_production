/**
 * The BuildMyLogic sidebar webview.
 *
 * Kept in its own module so the panel markup/styles stay readable instead of
 * living inside extension.ts as string replacements.
 *
 * Everything is themed with VS Code CSS variables, so the panel follows the
 * user's colour theme (light, dark, high contrast) automatically.
 */

export function sidebarHtml(cspSource: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${cspSource};">
<title>BuildMyLogic</title>
<style>
  :root {
    --bml-accent: var(--vscode-focusBorder, #7c3aed);
    --bml-accent-soft: color-mix(in srgb, var(--bml-accent) 14%, transparent);
    --bml-ok: var(--vscode-testing-iconPassed, #3fb950);
    --bml-bad: var(--vscode-errorForeground, #f85149);
    --bml-radius: 10px;
    --bml-gap: 10px;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    padding: 0 12px 24px;
    background: var(--vscode-sideBar-background, transparent);
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family);
    font-size: 12.5px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  button, input { font: inherit; color: inherit; }
  button { cursor: pointer; border: 0; }
  button:focus-visible, input:focus-visible, a:focus-visible {
    outline: 1px solid var(--vscode-focusBorder, var(--bml-accent));
    outline-offset: 2px;
  }
  .muted { color: var(--vscode-descriptionForeground); }
  .ok { color: var(--bml-ok); }
  .bad { color: var(--bml-bad); }

  /* ---------- header ---------- */
  .top {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 -12px;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--vscode-sideBar-background, #1e1e1e) 92%, transparent);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border, transparent));
  }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 800; letter-spacing: -0.02em; font-size: 13.5px; }
  .brand-mark {
    display: grid; place-items: center;
    width: 22px; height: 22px; border-radius: 7px;
    background: var(--bml-accent); color: var(--vscode-sideBar-background, #fff);
    font-size: 12px; font-weight: 900;
  }
  .live {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 9px; border-radius: 999px;
    background: var(--vscode-badge-background, rgba(128,128,128,.2));
    color: var(--vscode-badge-foreground, inherit);
    font-size: 10px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
  }
  .pulse { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .45; }
  .live[data-state="on"] { color: var(--bml-ok); background: color-mix(in srgb, var(--bml-ok) 18%, transparent); }
  .live[data-state="on"] .pulse { opacity: 1; animation: bml-pulse 1.6s ease-in-out infinite; }
  .live[data-state="wait"] { color: var(--vscode-descriptionForeground); }
  .live[data-state="off"] { color: var(--bml-bad); background: color-mix(in srgb, var(--bml-bad) 16%, transparent); }
  @keyframes bml-pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.45); opacity: .5; } }

  .sync-note { margin: 8px 2px 0; font-size: 10.5px; color: var(--vscode-descriptionForeground); min-height: 14px; }

  /* ---------- panels ---------- */
  [hidden] { display: none !important; }
  .card {
    background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background));
    border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border, rgba(128,128,128,.25)));
    border-radius: var(--bml-radius);
    padding: 12px;
    margin-top: var(--bml-gap);
  }
  .eyebrow {
    font-size: 10px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
  }
  .card h1 { margin: 6px 0 0; font-size: 15px; line-height: 1.3; font-weight: 750; letter-spacing: -.01em; }
  .card p { margin: 8px 0 0; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .chip {
    padding: 3px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
    background: var(--vscode-badge-background, rgba(128,128,128,.2));
    color: var(--vscode-badge-foreground, inherit);
  }
  .chip.accent { background: var(--bml-accent-soft); color: var(--bml-accent); }

  /* ---------- connect ---------- */
  .label { display: block; margin: 14px 0 6px; font-size: 11px; font-weight: 700; }
  .input {
    width: 100%; padding: 9px 11px; border-radius: 8px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    color: var(--vscode-input-foreground);
    font-weight: 700; letter-spacing: .08em;
  }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    width: 100%; padding: 10px 12px; border-radius: 8px; margin-top: 8px;
    font-weight: 750; letter-spacing: .01em;
    transition: filter .15s ease, transform .1s ease, opacity .15s ease;
  }
  .btn:active { transform: translateY(1px); }
  .btn:disabled { opacity: .55; cursor: default; }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .btn-primary:hover { filter: brightness(1.12); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  .btn-secondary:hover { filter: brightness(1.18); }
  .btn-ghost { background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.3)); }
  .btn-ghost:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,.12)); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .grid2 .btn { margin-top: 0; }

  /* ---------- progress ---------- */
  .progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .score { font-size: 20px; font-weight: 850; letter-spacing: -.03em; }
  .track { height: 6px; border-radius: 999px; background: var(--vscode-progressBar-background, rgba(128,128,128,.25)); margin-top: 10px; overflow: hidden; }
  .fill { height: 100%; width: 0; border-radius: 999px; background: var(--bml-accent); transition: width .35s cubic-bezier(.2,.8,.2,1); }

  .checks { list-style: none; margin: 10px 0 0; padding: 0; }
  .check {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 7px 0; border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.15));
    line-height: 1.35;
  }
  .check:first-child { border-top: 0; }
  .check-icon { width: 14px; text-align: center; font-weight: 900; }
  .check[data-evidence="verified"] .check-icon { color: var(--bml-ok); }
  .check[data-evidence="detected"] .check-icon { color: var(--bml-accent); }
  .check[data-evidence="not_verified"] .check-icon { color: var(--vscode-descriptionForeground); }
  .check-title { flex: 1; min-width: 0; }
  .check-state { font-size: 9px; font-weight: 850; letter-spacing: .07em; white-space: nowrap; opacity: .9; }

  /* ---------- tabs ---------- */
  .tabs {
    display: flex; gap: 2px; margin: 14px -12px 0; padding: 0 12px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2));
  }
  .tab {
    background: transparent; color: var(--vscode-descriptionForeground);
    padding: 8px 10px; font-size: 11.5px; font-weight: 750;
    border-bottom: 2px solid transparent; border-radius: 0;
  }
  .tab:hover { color: var(--vscode-foreground); }
  .tab.active { color: var(--vscode-foreground); border-bottom-color: var(--bml-accent); }

  pre.result {
    margin: 0; white-space: pre-wrap; word-break: break-word;
    font-family: var(--vscode-editor-font-family, var(--vscode-monospace-font-family, monospace));
    font-size: 11.5px; line-height: 1.55; color: var(--vscode-foreground);
    max-height: 320px; overflow: auto;
  }
  .tip {
    display: flex; gap: 9px; align-items: flex-start;
    background: var(--bml-accent-soft);
    border: 1px solid color-mix(in srgb, var(--bml-accent) 35%, transparent);
    border-radius: var(--bml-radius); padding: 11px; margin-top: var(--bml-gap);
  }
  .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: var(--bml-gap); }
  .stat {
    border: 1px solid var(--vscode-widget-border, rgba(128,128,128,.2));
    border-radius: 8px; padding: 9px 10px;
  }
  .stat b { display: block; font-size: 17px; font-weight: 850; letter-spacing: -.02em; }
  .stat span { font-size: 10px; color: var(--vscode-descriptionForeground); }

  .status { min-height: 16px; margin: 12px 2px 0; font-size: 11px; line-height: 1.45; color: var(--vscode-descriptionForeground); }
  .status.error { color: var(--bml-bad); }
  .footer {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin-top: 16px; padding-top: 10px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,.18));
    font-size: 10.5px; color: var(--vscode-descriptionForeground);
  }
  .link { background: transparent; color: var(--vscode-textLink-foreground); padding: 0; font-size: 10.5px; }
  .link:hover { text-decoration: underline; }
  .instructions { margin-top: 8px; white-space: pre-wrap; max-height: 132px; overflow: auto; }
  .instructions.open { max-height: none; }
  .expand { margin-top: 6px; background: transparent; color: var(--vscode-textLink-foreground); padding: 0; font-size: 11px; }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
</style>
</head>
<body>
  <header class="top">
    <div class="brand"><span class="brand-mark">B</span> BuildMyLogic</div>
    <div class="live" id="live" data-state="off"><span class="pulse"></span><span id="liveText">Offline</span></div>
  </header>
  <p class="sync-note" id="syncNote">Not connected to a session.</p>

  <section id="connect" class="card">
    <p class="eyebrow">Connect your session</p>
    <h1>Bring the mission into VS Code</h1>
    <p class="muted">Start a session on the BuildMyLogic website, then paste its Session ID here. Everything else stays in sync automatically.</p>
    <label class="label" for="sid">Session ID</label>
    <input class="input" id="sid" autocomplete="off" spellcheck="false" placeholder="BML-7X29K">
    <button class="btn btn-primary" id="connectButton">Connect session</button>
    <p class="muted" style="font-size:11px">The website and this panel share the same session, so hints, progress and mentor notes move both ways instantly.</p>
  </section>

  <section id="active" hidden>
    <section class="card">
      <p class="eyebrow">Current mission</p>
      <h1 id="title">Build a challenge</h1>
      <div class="chips">
        <span class="chip" id="language">Code</span>
        <span class="chip" id="concept">Problem solving</span>
        <span class="chip accent" id="level">Active</span>
      </div>
      <div class="instructions muted" id="mission"></div>
      <button class="expand" id="expand" hidden>Show full brief</button>
    </section>

    <section class="card">
      <div class="progress-head">
        <div><p class="eyebrow">Progress</p><span class="score" id="score">0/4</span></div>
        <span class="muted" id="scoreLabel">Not run yet</span>
      </div>
      <div class="track"><div class="fill" id="progressFill"></div></div>
      <p class="eyebrow" style="margin-top:14px">Session tasks</p>
      <ul class="checks" id="requirements"></ul>
      <p class="muted" style="font-size:10.5px;margin-top:8px">✓ verified · ◐ detected · ○ not verified</p>
    </section>

    <div class="tabs">
      <button class="tab active" data-tab="challenge">Build</button>
      <button class="tab" data-tab="tests">Tests</button>
      <button class="tab" data-tab="feedback">Vibe</button>
      <button class="tab" data-tab="progress">Stats</button>
    </div>

    <div class="panel" data-panel="challenge">
      <button class="btn btn-primary" id="run">▶&nbsp; Run tests locally</button>
      <div class="grid2" style="margin-top:8px">
        <button class="btn btn-secondary" id="hint">💡 Hint</button>
        <button class="btn btn-secondary" id="stuck">🆘 I'm stuck</button>
      </div>
      <button class="btn btn-secondary" id="submit" style="margin-top:8px">⇧&nbsp; Submit project</button>
      <button class="btn btn-ghost" id="failed" style="margin-top:8px">Mark as failed &amp; get a recovery plan</button>
    </div>

    <div class="panel" data-panel="tests" hidden>
      <section class="card">
        <p class="eyebrow">Latest run</p>
        <pre class="result muted" id="tests">Run the challenge tests from the Build tab.</pre>
      </section>
    </div>

    <div class="panel" data-panel="feedback" hidden>
      <div class="tip"><span>💡</span><div><b>Vibe</b><p class="muted" id="feedback" style="margin-top:4px">Ask for a hint whenever you want one — it never runs your tests for you.</p></div></div>
      <section id="recovery" class="tip" hidden><span>🧭</span><div><b>Recovery plan</b><p class="muted" id="recoveryText" style="margin-top:4px"></p></div></section>
    </div>

    <div class="panel" data-panel="progress" hidden>
      <div class="stats">
        <div class="stat"><b id="attempts">0</b><span>Attempts</span></div>
        <div class="stat"><b id="hints">0</b><span>Hints used</span></div>
        <div class="stat"><b id="scoreStat">—</b><span>Test score</span></div>
        <div class="stat"><b id="struggle">No</b><span>Needs attention</span></div>
      </div>
      <button class="btn btn-ghost" id="disconnect" style="margin-top:12px">Disconnect session</button>
    </div>
  </section>

  <p id="status" class="status"></p>

  <div class="footer">
    <span id="sessionLabel">BuildMyLogic learning session</span>
    <button class="link" id="copyId">Copy Session ID</button>
  </div>

<script>
(function () {
  var vscode = acquireVsCodeApi();
  var $ = function (id) { return document.getElementById(id); };
  var current = null;
  var lastSyncAt = 0;
  var syncTimer = null;

  function send(command) {
    vscode.postMessage({ command: command, sessionId: $("sid").value });
  }

  function setTab(name) {
    var tabs = document.querySelectorAll(".tab");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("active", tabs[i].getAttribute("data-tab") === name);
    var panels = document.querySelectorAll(".panel");
    for (var j = 0; j < panels.length; j++) panels[j].hidden = panels[j].getAttribute("data-panel") !== name;
  }

  function setLive(state, text) {
    $("live").setAttribute("data-state", state);
    $("liveText").textContent = text;
  }

  function markSynced() {
    lastSyncAt = Date.now();
    if (!syncTimer) {
      syncTimer = setInterval(function () {
        if (!lastSyncAt) return;
        var seconds = Math.round((Date.now() - lastSyncAt) / 1000);
        $("syncNote").textContent = seconds < 2 ? "Live · synced just now" : "Live · synced " + seconds + "s ago";
      }, 1000);
    }
    $("syncNote").textContent = "Live · synced just now";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { setStatus("Session ID copied."); }).catch(function () { fallbackCopy(text); });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    try { document.execCommand("copy"); setStatus("Session ID copied."); } catch (e) { setStatus("Copy the Session ID manually.", true); }
    input.remove();
  }

  function setStatus(text, isError) {
    var node = $("status");
    node.textContent = text || "";
    node.className = "status" + (isError ? " error" : "");
  }

  function renderEvidence(session) {
    var root = $("requirements");
    if (!root) return;
    root.innerHTML = "";
    var items = session.checkpoints || [];
    var verified = 0;
    for (var i = 0; i < items.length; i++) {
      var cp = items[i];
      var evidence = cp.evidence || (cp.status === "passed" ? "verified" : "not_verified");
      if (evidence === "verified") verified += 1;
      var li = document.createElement("li");
      li.className = "check";
      li.setAttribute("data-evidence", evidence);
      var icon = document.createElement("span");
      icon.className = "check-icon";
      icon.textContent = evidence === "verified" ? "✓" : evidence === "detected" ? "◐" : "○";
      var title = document.createElement("span");
      title.className = "check-title";
      title.textContent = cp.title || "Step " + (cp.index + 1);
      var state = document.createElement("span");
      state.className = "check-state";
      state.textContent = evidence === "verified" ? "VERIFIED" : evidence === "detected" ? "DETECTED" : "NOT VERIFIED";
      li.appendChild(icon);
      li.appendChild(title);
      li.appendChild(state);
      root.appendChild(li);
    }
    if (!items.length) {
      var empty = document.createElement("li");
      empty.className = "check muted";
      empty.textContent = "No tasks published for this session yet.";
      root.appendChild(empty);
    }
    $("level").textContent = verified + "/" + items.length + " verified";
  }

  function render(session) {
    if (!session) return;
    current = session;
    $("sid").value = session.session_id || "";
    $("connect").hidden = true;
    $("active").hidden = false;
    var failed = session.status === "failed";
    var done = session.status === "completed";
    setLive(done || failed ? "wait" : "on", done ? "Proven" : failed ? "Recovery" : "Live");
    markSynced();
    $("title").textContent = session.title || "Build a challenge";
    $("language").textContent = session.language || "Code";
    $("concept").textContent = session.concept || "Problem solving";
    $("level").textContent = done ? "Proven" : failed ? "Recovery" : "Active";
    $("sessionLabel").textContent = session.session_id || "BuildMyLogic learning session";

    var lines = (session.instructions || "").split("\\n");
    var brief = [];
    var tasks = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;
      if (/^\\s*[•\\-]/.test(line) || /^\\s*Step\\s+\\d+/i.test(line)) tasks.push(line.replace(/^\\s*[•\\-]\\s*/, ""));
      else brief.push(line);
    }
    var mission = $("mission");
    mission.textContent = brief.join("\\n") || "Complete the challenge requirements.";
    mission.className = "instructions muted";
    $("expand").hidden = mission.scrollHeight <= mission.clientHeight + 4;
    renderEvidence(session);

    var passed = session.test_score ? session.test_score.passed : 0;
    var total = session.test_score ? session.test_score.total : (session.checkpoints ? session.checkpoints.length : 0) || 0;
    $("score").textContent = total ? passed + "/" + total : "—";
    $("scoreLabel").textContent = total ? Math.min(100, Math.round((passed / total) * 100)) + "% complete" : "Not run yet";
    $("progressFill").style.width = (total ? Math.min(100, Math.round((passed / total) * 100)) : 0) + "%";
    $("attempts").textContent = session.attempts || 0;
    $("hints").textContent = session.hints_used || 0;
    $("scoreStat").textContent = total ? passed + "/" + total : "—";
    $("struggle").textContent = session.potential_struggle ? "Yes" : "No";
    if (session.latest_mentor_feedback) {
      $("feedback").textContent = session.latest_mentor_feedback;
    }
    if (done) setStatus("Challenge proven. Your skill evidence was updated on the website.", false);
  }

  var tabs = document.querySelectorAll(".tab");
  for (var t = 0; t < tabs.length; t++) {
    tabs[t].addEventListener("click", function (event) { setTab(event.currentTarget.getAttribute("data-tab")); });
  }
  $("expand").addEventListener("click", function () {
    var mission = $("mission");
    var open = mission.classList.toggle("open");
    $("expand").textContent = open ? "Hide brief" : "Show full brief";
  });
  $("connectButton").addEventListener("click", function () {
    var id = $("sid").value.trim();
    if (!id) { setStatus("Paste your Session ID first.", true); return; }
    var button = $("connectButton");
    button.disabled = true;
    button.textContent = "Connecting…";
    setLive("wait", "Connecting");
    send("connect");
    setTimeout(function () {
      if (button.disabled) { button.disabled = false; button.textContent = "Connect session"; setLive("off", "Offline"); }
    }, 12000);
  });
  $("run").addEventListener("click", function () { send("runTests"); });
  $("submit").addEventListener("click", function () { send("submit"); });
  $("hint").addEventListener("click", function () { send("hint"); });
  $("stuck").addEventListener("click", function () { send("stuck"); });
  $("failed").addEventListener("click", function () { send("failed"); });
  $("disconnect").addEventListener("click", function () { send("disconnect"); });
  $("copyId").addEventListener("click", function () { if (current) copyText(current.session_id); });
  $("sid").addEventListener("keydown", function (event) { if (event.key === "Enter") $("connectButton").click(); });

  window.addEventListener("message", function (event) {
    var message = event.data || {};
    if (message.session) render(message.session);
    if (message.type === "tests") {
      render(message.session);
      setTab("tests");
      var output = (message.guidance ? message.guidance + "\\n\\n" : "") + (message.output || "No command output.");
      $("tests").textContent = output;
      $("tests").classList.toggle("muted", !message.passed);
      setStatus(message.passed ? "Tests passed — evidence sent to BuildMyLogic." : "Tests failed. Read the output, fix one thing, run again.", !message.passed);
    } else if (message.type === "guidance") {
      if (message.text) $("feedback").textContent = message.text;
      render(message.session);
      setTab("feedback");
      setStatus("Vibe replied.", false);
    } else if (message.type === "failed") {
      $("recovery").hidden = false;
      $("recoveryText").textContent = message.text || "";
      render(message.session);
      setTab("feedback");
      setStatus("Marked as failed. A recovery plan is ready.", true);
    } else if (message.type === "submission") {
      render(message.session);
      setTab("feedback");
      $("feedback").textContent = "Project submitted.\\n\\n" + (message.text || "BuildMyLogic is reviewing your project.");
      setStatus("Project submitted.", false);
    } else if (message.type === "status") {
      setStatus(message.text || "", Boolean(message.error));
    } else if (message.type === "disconnected") {
      $("connect").hidden = false;
      $("active").hidden = true;
      setLive("off", "Offline");
      $("syncNote").textContent = "Disconnected from the learning session.";
      lastSyncAt = 0;
    }
  });
})();
</script>
</body>
</html>`;
}
