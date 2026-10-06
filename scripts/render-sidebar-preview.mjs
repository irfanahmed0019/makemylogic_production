/**
 * Renders the real VS Code sidebar HTML into a standalone page so the panel can
 * be reviewed in a browser (light + dark) without launching VS Code.
 *
 * It fakes `acquireVsCodeApi()` and answers the panel's messages with a sample
 * session, so every state (connect, challenge, tests, Vibe) is clickable.
 *
 * Usage: node scripts/render-sidebar-preview.mjs
 * Output: vscode-extension/sidebar-preview.html
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("../vscode-extension/node_modules/esbuild/lib/main.js");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const outFile = path.join(root, "vscode-extension", "sidebar-preview.html");

const bundled = await esbuild.build({
  entryPoints: [path.join(root, "vscode-extension/src/webviewHtml.ts")],
  bundle: true,
  platform: "neutral",
  format: "esm",
  target: "es2022",
  write: false,
  logLevel: "silent",
});
const moduleText = bundled.outputFiles[0].text;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleText, "utf8").toString("base64")}`;
const sidebarHtml = (await import(moduleUrl)).sidebarHtml("self");

// The panel expects VS Code to provide acquireVsCodeApi(); define it before the
// panel's own script runs and forward its messages to the harness page.
const shim = `<script>window.acquireVsCodeApi=function(){return{postMessage:function(m){parent.postMessage({__panel:m},"*")}}};</script>`;

// VS Code defines its colour tokens on the document root, so the preview has to
// do the same *inside* the iframe (custom properties do not cross frames).
const tokens = {
  dark: `
    --vscode-sideBar-background:#1f1f1f; --vscode-sideBarSectionHeader-border:#2b2b2b;
    --vscode-editorWidget-background:#252526; --vscode-widget-border:#3c3c3c; --vscode-panel-border:#3c3c3c;
    --vscode-foreground:#d4d4d4; --vscode-descriptionForeground:#9d9d9d; --vscode-focusBorder:#7c3aed;
    --vscode-font-family:Inter, ui-sans-serif, system-ui, sans-serif;
    --vscode-editor-font-family:"SF Mono", Menlo, Consolas, monospace;
    --vscode-badge-background:#3c3c3c; --vscode-badge-foreground:#d4d4d4;
    --vscode-button-background:#7c3aed; --vscode-button-foreground:#ffffff;
    --vscode-button-secondaryBackground:#3a3a3a; --vscode-button-secondaryForeground:#e4e4e4;
    --vscode-input-background:#2a2a2a; --vscode-input-foreground:#eaeaea; --vscode-input-border:#4a4a4a;
    --vscode-textLink-foreground:#a78bfa; --vscode-progressBar-background:#3c3c3c;
    --vscode-errorForeground:#f85149; --vscode-testing-iconPassed:#3fb950;
    --vscode-toolbar-hoverBackground:#333333;`,
  light: `
    --vscode-sideBar-background:#f8f8f8; --vscode-sideBarSectionHeader-border:#e2e2e2;
    --vscode-editorWidget-background:#ffffff; --vscode-widget-border:#dcdcdc; --vscode-panel-border:#dcdcdc;
    --vscode-foreground:#1f1f1f; --vscode-descriptionForeground:#616161; --vscode-focusBorder:#7c3aed;
    --vscode-font-family:Inter, ui-sans-serif, system-ui, sans-serif;
    --vscode-editor-font-family:"SF Mono", Menlo, Consolas, monospace;
    --vscode-badge-background:#ececec; --vscode-badge-foreground:#3d3d3d;
    --vscode-button-background:#7c3aed; --vscode-button-foreground:#ffffff;
    --vscode-button-secondaryBackground:#ececec; --vscode-button-secondaryForeground:#2f2f2f;
    --vscode-input-background:#ffffff; --vscode-input-foreground:#1f1f1f; --vscode-input-border:#d0d0d0;
    --vscode-textLink-foreground:#6d28d9; --vscode-progressBar-background:#e2e2e2;
    --vscode-errorForeground:#d1242f; --vscode-testing-iconPassed:#1a7f37;
    --vscode-toolbar-hoverBackground:#ececec;`,
};

const panelHtml = sidebarHtml.replace(
  "<body>",
  `<body><style id="vscode-tokens">:root{${tokens.dark}}</style>${shim}`,
);

const sampleSession = {
  session_id: "BML-7X29K",
  challenge_id: "cli-calculator",
  title: "Build a CLI calculator",
  language: "Python",
  concept: "conditions and operators",
  instructions:
    "Build a small command line calculator that reads two numbers and an operator.\n\nRequirements:\n• Read two numbers from the user\n• Support +, -, * and /\n• Guard against division by zero\n• Print the result with a clear message",
  expected_skills: ["python", "conditions", "cli"],
  status: "active",
  attempts: 3,
  hints_used: 1,
  test_score: { passed: 2, total: 4 },
  latest_mentor_feedback:
    "Almost. Your division branch runs before you check for zero — move the guard above it and run the tests again.",
  potential_struggle: true,
  extension_status: "active",
  rev: 7,
  checkpoints: [
    {
      index: 0,
      title: "Read two numbers from the user",
      status: "passed",
      evidence: "verified",
      attempts: 1,
    },
    {
      index: 1,
      title: "Support +, -, * and /",
      status: "passed",
      evidence: "detected",
      attempts: 2,
    },
    {
      index: 2,
      title: "Guard against division by zero",
      status: "active",
      evidence: "not_verified",
      attempts: 1,
    },
    {
      index: 3,
      title: "Print the result with a clear message",
      status: "locked",
      evidence: "not_verified",
      attempts: 0,
    },
  ],
};

// Escape "</" so panel markup inside a JSON string cannot terminate the harness <script> block.
const json = (value) => JSON.stringify(value).replace(/<\//g, "<\\/");

const harness = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BuildMyLogic sidebar preview</title>
<style>
  /* Layout only — colour tokens are injected into the iframe document. */
  body {
    margin: 0;
    display: flex;
    min-height: 100vh;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    background: #171717;
    color: #eaeaea;
  }
  .rail {
    width: 300px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #111;
    border-right: 1px solid #262626;
  }
  .rail h1 { font-size: 13px; letter-spacing: -0.01em; margin: 0; }
  .rail p { font-size: 12px; line-height: 1.5; color: #9d9d9d; margin: 0; }
  .rail code { color: #c4b5fd; }
  .rail button {
    text-align: left; padding: 9px 11px; border-radius: 8px; border: 1px solid #2f2f2f;
    background: #1c1c1c; color: #eaeaea; font-size: 12px; font-weight: 650; cursor: pointer;
  }
  .rail button:hover { background: #242424; }
  #log { word-break: break-word; min-height: 60px; }
  .frame-wrap { flex: 1; padding: 16px; }
  iframe { width: 100%; height: calc(100vh - 32px); border: 1px solid #2f2f2f; border-radius: 12px; background: #1f1f1f; }
</style>
</head>
<body class="dark">
  <aside class="rail">
    <h1>Sidebar preview</h1>
    <p>Real panel HTML from <code>src/webviewHtml.ts</code> with sample session data.</p>
    <button data-action="theme">Toggle light / dark theme</button>
    <button data-action="connect">Simulate: session connected</button>
    <button data-action="tests-pass">Simulate: tests passed</button>
    <button data-action="tests-fail">Simulate: tests failed</button>
    <button data-action="guidance">Simulate: Vibe hint arrives</button>
    <button data-action="disconnect">Simulate: disconnected</button>
    <p id="log">Panel messages appear here.</p>
  </aside>
  <div class="frame-wrap"><iframe id="frame" title="sidebar"></iframe></div>
<script>
  const session = ${json(sampleSession)};
  const panelHtml = ${json(panelHtml)};
  const frame = document.getElementById("frame");
  const log = document.getElementById("log");

  frame.contentDocument.open();
  frame.contentDocument.write(panelHtml);
  frame.contentDocument.close();

  window.addEventListener("message", (event) => {
    if (event.data && event.data.__panel) log.textContent = "panel → " + JSON.stringify(event.data.__panel);
  });

  function send(message) { frame.contentWindow.postMessage(message, "*"); }

  const tokens = ${json(tokens)};

  document.querySelector("[data-action=theme]").onclick = () => {
    document.body.classList.toggle("light");
    document.body.classList.toggle("dark");
    const light = document.body.classList.contains("light");
    const style = frame.contentDocument.getElementById("vscode-tokens");
    if (style) style.textContent = ":root{" + (light ? tokens.light : tokens.dark) + "}";
    document.querySelector(".frame-wrap").style.background = light ? "#e9e9e9" : "#171717";
  };
  document.querySelector("[data-action=connect]").onclick = () => send({ type: "session", session });
  document.querySelector("[data-action=tests-pass]").onclick = () =>
    send({ type: "tests", passed: true, output: "$ python3 main.py\\n✓ 4 checks green", guidance: "Nice. The zero-division guard works.", session: Object.assign({}, session, { test_score: { passed: 4, total: 4 }, status: "completed" }) });
  document.querySelector("[data-action=tests-fail]").onclick = () =>
    send({ type: "tests", passed: false, output: "$ python3 main.py\\nZeroDivisionError: division by zero", guidance: "Check the guard before the division.", session });
  document.querySelector("[data-action=guidance]").onclick = () =>
    send({ type: "guidance", text: "Almost. Your division branch runs before the zero check.", session });
  document.querySelector("[data-action=disconnect]").onclick = () => send({ type: "disconnected" });

  send({ type: "session", session });
</script>
</body>
</html>`;

fs.writeFileSync(outFile, harness, "utf8");
console.log(`Wrote ${path.relative(root, outFile)}`);
