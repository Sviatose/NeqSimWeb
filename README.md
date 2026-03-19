# NeqSimWeb

Browser-first prototype for a NeqSim-inspired process simulator.

Current scope:
- white flowsheet workspace with a right-side unit operations palette
- project creation flow with a large green plus card
- backend folder creation for each project
- fluid model selection and component transfer list
- automatic creation of a backend fluid named `fluid_base`

Project structure:
- `client`: React + Vite frontend
- `server`: Express API that creates project directories and stores fluid setup

Run locally:

```bash
npm install
npm run dev
```

Default URLs:
- frontend: `http://localhost:5173`
- backend: `http://localhost:3001`