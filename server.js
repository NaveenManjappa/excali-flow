const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ROOT = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.excaliflow': 'application/json; charset=utf-8',
  '.excalidraw': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4'
};

/* -------------------------------------------------------------------------
 * Workspace: projects are folders, canvases are <name>.excaliflow files
 * ------------------------------------------------------------------------- */
const CANVAS_EXT = '.excaliflow';
const TRASH_DIR = '.trash';
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const ALLOWED_API_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function resolveWorkspaceDir(dir) {
  const raw = String(dir || '').trim();
  if (!raw) return path.join(ROOT, 'workspace');
  if (raw === '~' || raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(1));
  return path.resolve(raw);
}

let workspaceRoot = resolveWorkspaceDir(process.env.WORKSPACE);

// Strips path separators, reserved characters, control characters and leading dots,
// so a name can only ever address a direct child of its parent folder.
function sanitizeName(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '')
    .replace(/^[.\s]+/, '')
    .slice(0, 80)
    .replace(/[.\s]+$/, '')
    .trim();
}

function uniqueName(base, existing) {
  const taken = new Set([...existing].map(n => n.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function insideWorkspace(...segments) {
  const target = path.resolve(workspaceRoot, ...segments);
  if (!target.startsWith(workspaceRoot + path.sep)) throw new ApiError(403, 'Forbidden');
  return target;
}

function requireName(segment) {
  if (!segment || sanitizeName(segment) !== segment) throw new ApiError(400, 'Invalid name');
  return segment;
}

function cleanNewName(raw, fallback) {
  return sanitizeName(String(raw ?? '').replace(/\.excaliflow$/i, '')) || fallback;
}

function validateSceneText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'Canvas body must be valid JSON');
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.elements)) {
    throw new ApiError(400, 'Canvas body must contain an elements array');
  }
}

function emptySceneText() {
  return JSON.stringify({ type: 'excaliflow', version: 2, source: 'Excaliflow', elements: [], appState: {} }, null, 2);
}

async function statOrNull(p) {
  try {
    return await fsp.stat(p);
  } catch {
    return null;
  }
}

async function listDir(dir) {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function listProjectNames() {
  const entries = await listDir(workspaceRoot);
  return entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
}

async function listCanvasNames(projectDir) {
  const entries = await listDir(projectDir);
  return entries
    .filter(e => e.isFile() && !e.name.startsWith('.') && e.name.endsWith(CANVAS_EXT))
    .map(e => e.name.slice(0, -CANVAS_EXT.length));
}

async function requireProjectDir(projectName) {
  const dir = insideWorkspace(requireName(projectName));
  const st = await statOrNull(dir);
  if (!st || !st.isDirectory()) throw new ApiError(404, 'Project not found');
  return dir;
}

async function requireCanvasFile(projectName, canvasName) {
  const dir = await requireProjectDir(projectName);
  const file = insideWorkspace(projectName, requireName(canvasName) + CANVAS_EXT);
  const st = await statOrNull(file);
  if (!st || !st.isFile()) throw new ApiError(404, 'Canvas not found');
  return { dir, file, stat: st };
}

// Write to a temp file in the same folder, then rename over the target, so a crash
// never leaves a half-written canvas behind.
async function writeAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}`);
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, file);
}

async function moveToTrash(target, label) {
  const trash = insideWorkspace(TRASH_DIR);
  await fsp.mkdir(trash, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fsp.rename(target, path.join(trash, `${stamp}-${label}`));
}

function canvasInfo(name, stat) {
  return { id: name, name, modified: stat.mtimeMs };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        failed = true;
        reject(new ApiError(413, 'Request body too large'));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', err => {
      if (!failed) reject(err);
    });
  });
}

async function readJsonBody(req) {
  const text = await readBody(req);
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : {};
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function hostnameOf(hostHeader) {
  const host = String(hostHeader || '').toLowerCase();
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0];
}

// Any website the user visits can fire requests at localhost. Requiring a custom header
// plus a JSON content type forces a CORS preflight, which this server never approves,
// and the Host check defeats DNS rebinding.
function checkApiRequest(req) {
  const headers = req.headers || {};
  if (!ALLOWED_API_HOSTS.has(hostnameOf(headers.host))) throw new ApiError(403, 'Forbidden host');
  if (headers['x-excaliflow'] !== '1') throw new ApiError(403, 'Missing X-Excaliflow header');
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    const type = String(headers['content-type'] || '').toLowerCase();
    if (!type.startsWith('application/json')) throw new ApiError(415, 'Content-Type must be application/json');
  }
}

async function routeApi(req, res, segments) {
  const method = req.method;
  await fsp.mkdir(workspaceRoot, { recursive: true });

  // GET /api/workspace
  if (segments.length === 1 && segments[0] === 'workspace' && method === 'GET') {
    const projects = [];
    for (const name of (await listProjectNames()).sort((a, b) => a.localeCompare(b))) {
      const dir = insideWorkspace(name);
      const canvases = [];
      for (const canvasName of (await listCanvasNames(dir)).sort((a, b) => a.localeCompare(b))) {
        const st = await statOrNull(path.join(dir, canvasName + CANVAS_EXT));
        if (st) canvases.push(canvasInfo(canvasName, st));
      }
      projects.push({ id: name, name, canvases });
    }
    sendJson(res, 200, { name: path.basename(workspaceRoot), projects });
    return;
  }

  if (segments[0] !== 'projects') throw new ApiError(404, 'Not found');

  // POST /api/projects
  if (segments.length === 1) {
    if (method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const body = await readJsonBody(req);
    const name = uniqueName(cleanNewName(body.name, 'Untitled Project'), await listProjectNames());
    await fsp.mkdir(insideWorkspace(name));
    sendJson(res, 201, { id: name, name, canvases: [] });
    return;
  }

  const projectName = segments[1];

  // PATCH / DELETE /api/projects/:p
  if (segments.length === 2) {
    const dir = await requireProjectDir(projectName);
    if (method === 'PATCH') {
      const body = await readJsonBody(req);
      const wanted = cleanNewName(body.name, projectName);
      const others = (await listProjectNames()).filter(n => n !== projectName);
      const name = uniqueName(wanted, others);
      if (name !== projectName) await fsp.rename(dir, insideWorkspace(name));
      sendJson(res, 200, { id: name, name });
      return;
    }
    if (method === 'DELETE') {
      await moveToTrash(dir, projectName);
      sendJson(res, 200, { ok: true });
      return;
    }
    throw new ApiError(405, 'Method not allowed');
  }

  if (segments[2] !== 'canvases') throw new ApiError(404, 'Not found');

  // POST /api/projects/:p/canvases
  if (segments.length === 3) {
    if (method !== 'POST') throw new ApiError(405, 'Method not allowed');
    const dir = await requireProjectDir(projectName);
    const body = await readJsonBody(req);
    const text = body.text === undefined ? emptySceneText() : String(body.text);
    validateSceneText(text);
    const name = uniqueName(cleanNewName(body.name, 'Untitled'), await listCanvasNames(dir));
    const file = insideWorkspace(projectName, name + CANVAS_EXT);
    await writeAtomic(file, text);
    sendJson(res, 201, canvasInfo(name, await fsp.stat(file)));
    return;
  }

  if (segments.length !== 4) throw new ApiError(404, 'Not found');
  const canvasName = segments[3];
  const { dir, file, stat } = await requireCanvasFile(projectName, canvasName);

  if (method === 'GET') {
    const text = await fsp.readFile(file, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Modified': String(stat.mtimeMs)
    });
    res.end(text);
    return;
  }

  if (method === 'PUT') {
    const expected = (req.headers || {})['if-unmodified-since-ms'];
    if (expected !== undefined && Math.abs(Number(expected) - stat.mtimeMs) > 0.5) {
      sendJson(res, 409, { error: 'Canvas changed on disk', modified: stat.mtimeMs });
      return;
    }
    const text = await readBody(req);
    validateSceneText(text);
    await writeAtomic(file, text);
    sendJson(res, 200, canvasInfo(canvasName, await fsp.stat(file)));
    return;
  }

  if (method === 'PATCH') {
    const body = await readJsonBody(req);
    const wanted = cleanNewName(body.name, canvasName);
    const others = (await listCanvasNames(dir)).filter(n => n !== canvasName);
    const name = uniqueName(wanted, others);
    const target = insideWorkspace(projectName, name + CANVAS_EXT);
    if (name !== canvasName) await fsp.rename(file, target);
    sendJson(res, 200, canvasInfo(name, await fsp.stat(target)));
    return;
  }

  if (method === 'DELETE') {
    await moveToTrash(file, `${projectName}-${canvasName}${CANVAS_EXT}`);
    sendJson(res, 200, { ok: true });
    return;
  }

  throw new ApiError(405, 'Method not allowed');
}

async function handleApi(req, res, rawPath) {
  try {
    checkApiRequest(req);
    const segments = rawPath.split('/').slice(2).filter(Boolean).map(seg => {
      try {
        return decodeURIComponent(seg);
      } catch {
        throw new ApiError(400, 'Bad Request');
      }
    });
    await routeApi(req, res, segments);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    sendJson(res, status, { error: status === 500 ? 'Internal Server Error' : err.message });
  }
}

/* -------------------------------------------------------------------------
 * Static files
 * ------------------------------------------------------------------------- */
const server = http.createServer((req, res) => {
  const rawPath = (req.url || '/').split('?')[0];
  if (rawPath === '/api' || rawPath.startsWith('/api/')) {
    handleApi(req, res, rawPath);
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('405 Method Not Allowed');
    return;
  }

  let decodedUrl = '/';
  try {
    decodedUrl = decodeURIComponent(rawPath);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }

  const relPath = decodedUrl === '/' ? 'index.html' : decodedUrl.replace(/^\/+/, '');
  const safePath = path.resolve(ROOT, relPath);

  if (safePath !== ROOT && !safePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  // Canvases are only reachable through the API, never as static files
  if (safePath === workspaceRoot || safePath.startsWith(workspaceRoot + path.sep)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  fs.stat(safePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Cache-Control': 'no-cache'
      });
      res.end();
      return;
    }

    fs.readFile(safePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });
});

server.setWorkspaceRoot = dir => {
  workspaceRoot = resolveWorkspaceDir(dir);
};
server.getWorkspaceRoot = () => workspaceRoot;

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Excaliflow Studio running at http://localhost:${PORT}`);
    console.log(`Workspace: ${workspaceRoot}`);
  });
}

module.exports = server;
