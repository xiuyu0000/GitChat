# Repository Guidelines

## Project Structure & Module Organization
- `nodechat/`: React client built with Create React App. Main code lives in `nodechat/src`, with graph UI components in `nodechat/src/components` and the default frontend test in `nodechat/src/App.test.js`.
- `server/`: Express API in `server/server.js`. The system prompt used by the backend is stored in `server/llm-branched-conversation-prompt.md`.
- `docs/bootstrap/`: design, audit, spec, task, and test-planning notes for the MVP.

Do not edit generated output under `nodechat/build` or installed dependencies under either `node_modules/`.

## Build, Test, and Development Commands
- `cd nodechat && npm start`: run the frontend at `http://localhost:3000`.
- `cd nodechat && npm run build`: create a production bundle in `nodechat/build`.
- `cd nodechat && npm test`: run the CRA/Jest test runner.
- `cd server && npm run dev`: start the backend with `nodemon` on port `8000`.
- `cd server && npm start`: run the backend once with Node.

Use separate terminals for client and server during local development.

## Coding Style & Naming Conventions
Follow the existing JavaScript style: 2-space indentation, semicolons, and single quotes. Use PascalCase for React components (`NodeChat.js`) and camelCase for helpers (`getConversationHistory`). Keep frontend graph logic in `nodechat/src/components`; keep backend request handling in `server/server.js` unless you are actively modularizing it. CRA provides ESLint during frontend runs.

## Testing Guidelines
Frontend tests use Jest and Testing Library through `react-scripts`. Name new tests `*.test.js` and place them beside the module they cover. Prioritize graph traversal helpers in `nodechat/src/lib/graph.js`, orchestration in `nodechat/src/components/NodeChat.js`, and persistence behavior around Dexie-backed state. The backend has no real automated suite yet; add one if you expand server logic.

## Commit & Pull Request Guidelines
Recent history favors short, imperative subjects, often with a prefix such as `docs:`. Prefer `feat: ...`, `fix: ...`, or `docs: ...`. PRs should include a brief behavior summary, linked task context when available, test evidence (`npm test`, manual API check), and screenshots for visible graph changes.

## Security & Configuration Tips
Store secrets in environment variables, not in source files. The backend expects `OPENROUTER_API_KEY`. Keep local development CORS aligned with `http://localhost:3000` unless both client and server are changed together.
