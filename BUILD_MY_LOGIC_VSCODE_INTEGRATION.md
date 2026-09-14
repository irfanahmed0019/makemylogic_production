# BuildMyLogic + VS Code integration

## Flow

1. BuildMyLogic web app creates a session at `/api/sessions/start` after the learner is authenticated.
2. The server returns a short Session ID such as `BML-7X29K`.
3. The Sessions page shows the ID, and its Open Session action launches the existing extension with that ID.
4. The learner can also paste the single Session ID into the extension and connect through `/api/sessions/connect`.
5. The extension receives the server-owned challenge context and stores only the Session ID in VS Code workspace state.
6. During the active session, the extension sends bounded test results, diagnostics, file-save evidence and heartbeats to `/api/sessions/{sessionId}/events`.
7. The backend validates the Session ID and session status before accepting events, detects repeated failures deterministically, and exposes the same state to the website.
8. `Ask Vibe for a Hint` and `I'm Stuck` are explicit actions that can call Sarvam server-side and return a short intervention to VS Code.

## Local development

Web: `npm run dev` (the existing dev script starts the desktop bridge too).

Extension:

```bash
cd vscode-extension
npm install -g @vscode/vsce
vsce package
code --install-extension buildmylogic-vscode-0.1.0.vsix
```

Do not put `SARVAM_API_KEY` in the extension. Keep it in the web/backend environment.
