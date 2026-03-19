import cors from 'cors';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const projectsDir = path.resolve(rootDir, 'data/projects');

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

function toProjectId(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function ensureProjectsDir() {
  await fs.mkdir(projectsDir, { recursive: true });
}

// List all existing projects
app.get('/api/projects', async (_request, response) => {
  await ensureProjectsDir();
  const entries = await fs.readdir(projectsDir, { withFileTypes: true });
  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await fs.readFile(path.join(projectsDir, entry.name, 'project.json'), 'utf-8');
      const config = JSON.parse(raw);
      projects.push({ projectId: config.projectId, projectName: config.projectName });
    } catch {
      // skip folders without valid project.json
    }
  }

  response.json(projects);
});

// Get a single project (with fluid if configured)
app.get('/api/projects/:projectId', async (request, response) => {
  const projectId = String(request.params.projectId ?? '').trim();
  if (!projectId) {
    response.status(400).json({ error: 'Project id is required.' });
    return;
  }

  const projectFolder = path.join(projectsDir, projectId);
  try {
    await fs.access(projectFolder);
  } catch {
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  const raw = await fs.readFile(path.join(projectFolder, 'project.json'), 'utf-8');
  const config = JSON.parse(raw);

  let fluid = null;
  try {
    const fluidRaw = await fs.readFile(path.join(projectFolder, 'backend', 'fluid_base', 'fluid.json'), 'utf-8');
    fluid = JSON.parse(fluidRaw);
  } catch {
    // no fluid configured yet
  }

  let workspace = null;
  try {
    const wsRaw = await fs.readFile(path.join(projectFolder, 'workspace.json'), 'utf-8');
    workspace = JSON.parse(wsRaw);
  } catch {
    // no workspace saved yet
  }

  response.json({
    projectId: config.projectId,
    projectName: config.projectName,
    folderPath: projectFolder,
    fluid,
    workspace
  });
});

app.post('/api/projects', async (request, response) => {
  const projectName = String(request.body?.projectName ?? '').trim();

  if (!projectName) {
    response.status(400).json({ error: 'Project name is required.' });
    return;
  }

  const projectId = toProjectId(projectName);
  if (!projectId) {
    response.status(400).json({ error: 'Project name must contain letters or numbers.' });
    return;
  }

  await ensureProjectsDir();
  const projectFolder = path.join(projectsDir, projectId);

  try {
    await fs.mkdir(projectFolder);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      response.status(409).json({ error: 'A project with that name already exists.' });
      return;
    }
    throw error;
  }

  const projectConfig = {
    projectId,
    projectName,
    createdAt: new Date().toISOString()
  };

  await fs.writeFile(path.join(projectFolder, 'project.json'), JSON.stringify(projectConfig, null, 2));
  await fs.mkdir(path.join(projectFolder, 'backend'), { recursive: true });

  response.status(201).json({
    projectId,
    projectName,
    folderPath: projectFolder
  });
});

app.post('/api/projects/:projectId/fluid', async (request, response) => {
  const projectId = String(request.params.projectId ?? '').trim();
  const model = String(request.body?.model ?? '').trim();
  const components = Array.isArray(request.body?.components)
    ? request.body.components.map((component) => String(component).trim()).filter(Boolean)
    : [];

  if (!projectId || !model || components.length === 0) {
    response.status(400).json({ error: 'Project, model, and at least one component are required.' });
    return;
  }

  const projectFolder = path.join(projectsDir, projectId);

  try {
    await fs.access(projectFolder);
  } catch {
    response.status(404).json({ error: 'Project folder was not found.' });
    return;
  }

  const fluidFolder = path.join(projectFolder, 'backend', 'fluid_base');
  await fs.mkdir(fluidFolder, { recursive: true });

  const fluidDefinition = {
    fluidName: 'fluid_base',
    model,
    components,
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(path.join(fluidFolder, 'fluid.json'), JSON.stringify(fluidDefinition, null, 2));

  response.status(201).json({
    fluidName: 'fluid_base',
    folderPath: fluidFolder,
    model,
    components
  });
});

// Run generated Python code
app.post('/api/projects/:projectId/run', async (request, response) => {
  const projectId = String(request.params.projectId ?? '').trim();
  const code = String(request.body?.code ?? '');

  if (!projectId || !code) {
    response.status(400).json({ error: 'Project ID and code are required.' });
    return;
  }

  const projectFolder = path.join(projectsDir, projectId);
  try {
    await fs.access(projectFolder);
  } catch {
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  const scriptPath = path.join(projectFolder, 'run_simulation.py');
  await fs.writeFile(scriptPath, code);

  try {
    const output = await new Promise((resolve, reject) => {
      execFile('python3', [scriptPath], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(stdout);
      });
    });

    // Parse results from stdout
    const startMarker = '__NEQSIM_RESULTS_START__';
    const endMarker = '__NEQSIM_RESULTS_END__';
    const startIdx = output.indexOf(startMarker);
    const endIdx = output.indexOf(endMarker);
    let results = null;
    if (startIdx !== -1 && endIdx !== -1) {
      const jsonStr = output.slice(startIdx + startMarker.length, endIdx).trim();
      results = JSON.parse(jsonStr);
    }

    response.json({ success: true, results, output });
  } catch (err) {
    response.status(500).json({ error: err.message ?? 'Script execution failed' });
  }
});

// Get saved workspace state
app.get('/api/projects/:projectId/workspace', async (request, response) => {
  const projectId = String(request.params.projectId ?? '').trim();
  if (!projectId) {
    response.status(400).json({ error: 'Project id is required.' });
    return;
  }

  const wsPath = path.join(projectsDir, projectId, 'workspace.json');
  try {
    const raw = await fs.readFile(wsPath, 'utf-8');
    response.json(JSON.parse(raw));
  } catch {
    response.json(null);
  }
});

// Save workspace state
app.put('/api/projects/:projectId/workspace', async (request, response) => {
  const projectId = String(request.params.projectId ?? '').trim();
  if (!projectId) {
    response.status(400).json({ error: 'Project id is required.' });
    return;
  }

  const projectFolder = path.join(projectsDir, projectId);
  try {
    await fs.access(projectFolder);
  } catch {
    response.status(404).json({ error: 'Project not found.' });
    return;
  }

  const wsPath = path.join(projectFolder, 'workspace.json');
  await fs.writeFile(wsPath, JSON.stringify(request.body, null, 2));
  response.json({ ok: true });
});

app.listen(port, async () => {
  await ensureProjectsDir();
  console.log(`NeqSim Web server listening on http://localhost:${port}`);
});
