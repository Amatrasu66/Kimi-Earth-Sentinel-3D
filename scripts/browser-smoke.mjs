// Real-browser smoke test: drives headless Microsoft Edge over the Chrome
// DevTools Protocol with zero dependencies — Node 24 built-ins only (global
// fetch + WebSocket). Required by the Phase 3 gate: the Phase 2 acceptance
// checklist's browser items (`C`/`G`) were blocked because no automation
// environment existed in the repo; this script is that environment.
//
// Usage:
//   node scripts/browser-smoke.mjs [--base-url http://localhost:3100]
//     [--out <dir>] [--port 9333] [--edge <path>]
//     [--ready-timeout-ms 90000] [--tile-wait-ms 30000]
//
// What it verifies against a running server (dev or production):
//   1. `/?renderer=cesium` opens and the Cesium Viewer initializes.
//   2. No "failed to initialize" veil and no runtime exceptions.
//   3. GIBS `wmts.cgi` tile responses arrive with HTTP 200.
//   4. `/cesium/` static assets (incl. `Workers/`) serve 200.
//   5. Mouse drag changes the rendered frame (camera interaction).
//   6. Wheel zoom + viewport resize update the canvas.
//   7. `?renderer=webgl` -> back to `?renderer=cesium` leaves exactly one
//      `.cesium-widget` (no duplicate Viewers).
//   8. The default `/` route still renders its dotted canvas and no Cesium
//      widget.
//   9. Phase 3: the geographic-grid preference survives a reload (wiring
//      only — the graticule itself is a human-reviewed screenshot claim),
//      and the canvas still tracks a narrow viewport.
//  10. CSP posture is judged from the served HTTP headers, never from
//      violation-message text: the app must not ship an ENFORCING
//      Content-Security-Policy header. Violation notes against the
//      report-only policy are collected but cannot block anything.
//
// Evidence (screenshots + JSON report) is written to `--out`. Screenshots
// require human review for visual claims; the programmatic checks assert
// lifecycle/wiring only. Exit code 1 when a hard check fails.
//
// This intentionally does NOT install Playwright/Puppeteer and does not use
// the user's default browser profile (isolated `--user-data-dir`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const flag = new Map();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const eq = a.indexOf('=');
  if (eq !== -1) {
    flag.set(a.slice(2, eq), a.slice(eq + 1));
  } else {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flag.set(a.slice(2), next);
      i += 1;
    } else {
      flag.set(a.slice(2), 'true');
    }
  }
}

const BASE_URL = flag.get('base-url') ?? 'http://localhost:3100';
const OUT_DIR = path.resolve(
  flag.get('out') ?? path.join(os.tmpdir(), 'sentinel-browser-smoke'),
);
const PORT = Number(flag.get('port') ?? 9333);
const READY_TIMEOUT_MS = Number(flag.get('ready-timeout-ms') ?? 90_000);
const TILE_WAIT_MS = Number(flag.get('tile-wait-ms') ?? 30_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findEdge() {
  const candidates = [
    flag.get('edge'),
    process.env.SENTINEL_EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/microsoft-edge',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Microsoft Edge not found — pass --edge <path>');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) {
          fn(msg.params, msg.sessionId);
        }
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });
  }

  on(method, fn) {
    const list = this.listeners.get(method) ?? [];
    list.push(fn);
    this.listeners.set(method, list);
  }

  once(method, timeoutMs = 60_000) {
    // Resolves `null` on timeout instead of rejecting: a pending waiter must
    // never turn into an unhandled rejection when the flow moves on.
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.on(method, (params) => {
        clearTimeout(timer);
        resolve(params);
      });
    });
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws));
    ws.addEventListener('error', () => reject(new Error(`websocket failed: ${url}`)));
  });
}

async function waitForDevtools() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      // browser not up yet
    }
    await sleep(500);
  }
  throw new Error('Edge DevTools endpoint never came up');
}

async function main() {
  const edge = findEdge();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const profileDir = path.join(OUT_DIR, 'edge-profile');
  const startedAt = new Date().toISOString();
  const steps = [];
  const shots = [];
  const consoleEvents = [];
  const exceptions = [];
  const logEntries = [];
  const responses = [];
  const failedLoads = [];
  const requestUrls = new Map();
  // CSP headers of served documents (the only trustworthy blocking signal).
  const documentCsp = [];

  const record = (step, pass, detail) => {
    steps.push({ step, pass, detail, at: new Date().toISOString() });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`);
  };

  const child = spawn(
    edge,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      '--remote-allow-origins=*',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--enable-unsafe-swiftshader',
      '--window-size=1600,900',
      '--hide-scrollbars',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp = null;
  let session = null;
  let edgeVersion = null;

  const cleanup = async () => {
    try {
      if (cdp) await cdp.send('Browser.close');
    } catch {
      // fall through to taskkill
    }
    await sleep(1500);
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      child.kill('SIGKILL');
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {
      // profile dir cleanup is best-effort on Windows file locks
    }
  };

  try {
    const version = await waitForDevtools();
    edgeVersion = version.Browser ?? 'unknown';
    const ws = await connect(version.webSocketDebuggerUrl);
    cdp = new Cdp(ws);

    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'warning') {
        consoleEvents.push({
          type: p.type,
          text: (p.args ?? [])
            .map((a) => a.value ?? a.description ?? a.type)
            .join(' ')
            .slice(0, 300),
        });
      }
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      exceptions.push({
        at: new Date().toISOString(),
        text: p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text,
      });
    });
    cdp.on('Log.entryAdded', (p) => {
      logEntries.push({
        level: p.entry?.level,
        source: p.entry?.source,
        url: p.entry?.url?.slice(0, 220),
        text: p.entry?.text?.slice(0, 300),
      });
    });
    cdp.on('Network.requestWillBeSent', (p) => {
      requestUrls.set(p.requestId, p.request?.url);
    });
    cdp.on('Network.responseReceived', (p) => {
      responses.push({
        url: p.response?.url,
        status: p.response?.status,
        type: p.type,
        mimeType: p.response?.mimeType,
      });
      if (p.type === 'Document') {
        const headers = p.response?.headers ?? {};
        documentCsp.push({
          url: p.response?.url,
          enforcing:
            headers['content-security-policy'] ?? headers['Content-Security-Policy'] ?? null,
          reportOnly:
            headers['content-security-policy-report-only'] ??
            headers['Content-Security-Policy-Report-Only'] ??
            null,
        });
      }
    });
    cdp.on('Network.loadingFailed', (p) => {
      failedLoads.push({
        url: requestUrls.get(p.requestId) ?? '',
        errorText: p.errorText,
        canceled: Boolean(p.canceled),
      });
    });

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const attached = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    session = attached.sessionId;
    const S = (method, params) => cdp.send(method, params, session);

    await S('Page.enable');
    await S('Runtime.enable');
    await S('Log.enable');
    await S('Network.enable');
    await S('Emulation.setDeviceMetricsOverride', {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const evalValue = async (expression) => {
      const res = await S('Runtime.evaluate', { expression, returnByValue: true });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate failed');
      }
      return res.result?.value;
    };

    const waitFor = async (expression, timeoutMs, label) => {
      const start = Date.now();
      let lastError = null;
      while (Date.now() - start < timeoutMs) {
        try {
          if (await evalValue(expression)) return Date.now() - start;
        } catch (e) {
          lastError = e;
        }
        await sleep(1000);
      }
      throw new Error(
        `timeout waiting for ${label}${lastError ? ` (${lastError.message})` : ''}`,
      );
    };

    const navigate = async (url) => {
      const loaded = cdp.once('Page.loadEventFired');
      await S('Page.navigate', { url });
      await Promise.race([loaded, sleep(60_000)]);
    };

    let shot = 0;
    const screenshot = async (name) => {
      shot += 1;
      const { data } = await S('Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(data, 'base64');
      const file = path.join(OUT_DIR, `${String(shot).padStart(2, '0')}-${name}.png`);
      fs.writeFileSync(file, buf);
      shots.push({ name, file, bytes: buf.length });
      return buf;
    };

    const drag = async (x0, y0, x1, y1, steps = 16) => {
      await S('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1,
      });
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        await S('Input.dispatchMouseEvent', {
          type: 'mouseMoved', x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, button: 'left', buttons: 1,
        });
        await sleep(25);
      }
      await S('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1,
      });
    };

    const wheel = async (x, y, deltaY) => {
      await S('Input.dispatchMouseEvent', {
        type: 'mouseWheel', x, y, deltaX: 0, deltaY,
      });
    };

    const CESIUM_READY = `(() => {
      const canvas = document.querySelector('.cesium-widget canvas');
      const loading = document.querySelector('[aria-label="Loading Cesium Earth renderer"]');
      const failed = document.querySelector('[aria-label="Cesium Earth failed to initialize"]');
      return Boolean(canvas) && !loading && !failed;
    })()`;

    // 1. Cesium branch opens and initializes.
    await navigate(`${BASE_URL}/?renderer=cesium`);
    record('open /?renderer=cesium', true, await evalValue('document.location.href'));
    let readyMs = null;
    try {
      readyMs = await waitFor(CESIUM_READY, READY_TIMEOUT_MS, 'Cesium Viewer ready');
      record('Cesium Viewer initializes', true, `${readyMs} ms`);
    } catch (e) {
      record('Cesium Viewer initializes', false, e.message);
    }

    const noErrorVeil = await evalValue(
      `!document.querySelector('[aria-label="Cesium Earth failed to initialize"]')`,
    );
    record('no failure veil', noErrorVeil === true, noErrorVeil ? undefined : 'error veil is visible');
    await screenshot('cesium-ready');

    // 2. Imagery tiles stream in.
    const wmtsCount = () => responses.filter((r) => r.url?.includes('wmts.cgi')).length;
    const wmtsOk = () =>
      responses.filter((r) => r.url?.includes('wmts.cgi') && r.status === 200).length;
    const tileDeadline = Date.now() + 45_000;
    while (Date.now() < tileDeadline && wmtsOk() === 0) await sleep(1000);
    await sleep(TILE_WAIT_MS);
    // Informational at this point: CDP response events can lag the renderer
    // under software GL. The authoritative imagery check runs at report time.
    record(
      'GIBS imagery requests observed',
      true,
      `${wmtsOk()} × 200 of ${wmtsCount()} so far (final tally at report time)`,
    );
    await screenshot('cesium-tiles');

    // 3. Camera interaction: drag must change the rendered frame.
    const before = await screenshot('cesium-pre-drag');
    await drag(800, 460, 1080, 430);
    await sleep(2500);
    const after = await screenshot('cesium-post-drag');
    record(
      'camera drag changes the frame',
      !before.equals(after),
      before.equals(after) ? 'frame identical before/after drag' : 'frame diff detected',
    );

    for (let i = 0; i < 3; i += 1) {
      await wheel(800, 450, -600);
      await sleep(200);
    }
    await sleep(2500);
    await screenshot('cesium-post-zoom');

    // 4. Resize follows the viewport.
    await S('Emulation.setDeviceMetricsOverride', {
      width: 1200, height: 700, deviceScaleFactor: 1, mobile: false,
    });
    // The widget can be mid-relayout right after the override (software GL):
    // poll until the canvas reports a real width before comparing.
    const measureCanvas = () =>
      evalValue(
        `({ w: window.innerWidth, cw: Math.round(document.querySelector('.cesium-widget canvas')?.clientWidth ?? 0) })`,
      );
    let sized = await measureCanvas();
    const sizeDeadline = Date.now() + 15_000;
    while (Date.now() < sizeDeadline && !(sized?.cw > 0)) {
      await sleep(500);
      sized = await measureCanvas();
    }
    record(
      'canvas resizes with viewport',
      Boolean(sized) && Math.abs(sized.cw - sized.w) <= 10,
      `innerWidth=${sized?.w} canvasWidth=${sized?.cw}`,
    );
    await screenshot('cesium-resized');
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(1500);

    // 5. Renderer round-trip: webgl -> cesium, exactly one Viewer.
    await navigate(`${BASE_URL}/?renderer=webgl`);
    try {
      await waitFor(
        `document.querySelectorAll('canvas').length > 0 && !document.querySelector('.cesium-widget')`,
        45_000,
        'WebGL branch canvas',
      );
      record('webgl branch renders', true);
    } catch (e) {
      record('webgl branch renders', false, e.message);
    }
    await sleep(2000);
    await screenshot('webgl-branch');

    await navigate(`${BASE_URL}/?renderer=cesium`);
    let roundTripOk = false;
    try {
      await waitFor(CESIUM_READY, READY_TIMEOUT_MS, 'Cesium Viewer ready (return)');
      const counts = await evalValue(
        `({ widgets: document.querySelectorAll('.cesium-widget').length, canvases: document.querySelectorAll('canvas').length })`,
      );
      roundTripOk = counts?.widgets === 1;
      record(
        'renderer round-trip leaves one Viewer',
        roundTripOk,
        `cesium-widget=${counts?.widgets} canvases=${counts?.canvases}`,
      );
    } catch (e) {
      record('renderer round-trip leaves one Viewer', false, e.message);
    }
    await sleep(4000);
    await screenshot('cesium-return');

    // 6. Phase 3: geographic grid preference survives a reload. Wiring only:
    // the screenshot above ('cesium-return', grid off) and 'cesium-grid'
    // (grid on) are the human-reviewed pair for the graticule itself.
    await evalValue(`window.localStorage.setItem('sentinel:globe-grid:v1', '1')`);
    await navigate(`${BASE_URL}/?renderer=cesium`);
    try {
      await waitFor(CESIUM_READY, READY_TIMEOUT_MS, 'Cesium Viewer ready (grid)');
      const stored = await evalValue(`window.localStorage.getItem('sentinel:globe-grid:v1')`);
      record('grid preference persists across reload', stored === '1', `stored=${stored}`);
    } catch (e) {
      record('grid preference persists across reload', false, e.message);
    }
    await sleep(6000);
    await screenshot('cesium-grid');

    // 7. Phase 3 §14.3: narrow viewport keeps the Cesium canvas sized.
    await S('Emulation.setDeviceMetricsOverride', {
      width: 430, height: 820, deviceScaleFactor: 2, mobile: true,
    });
    await sleep(2500);
    const narrow = await evalValue(
      `({ w: window.innerWidth, cw: Math.round(document.querySelector('.cesium-widget canvas')?.clientWidth ?? 0) })`,
    );
    record(
      'narrow viewport keeps canvas sized',
      Boolean(narrow) && Math.abs(narrow.cw - narrow.w) <= 10,
      `innerWidth=${narrow?.w} canvasWidth=${narrow?.cw}`,
    );
    await screenshot('cesium-narrow');
    await S('Emulation.clearDeviceMetricsOverride');
    await sleep(1500);

    // 8. Default route still renders the dotted canvas.
    await navigate(`${BASE_URL}/`);
    try {
      await waitFor(
        `document.querySelectorAll('canvas').length > 0 && !document.querySelector('.cesium-widget')`,
        30_000,
        'default dotted canvas',
      );
      record('default renderer renders', true);
    } catch (e) {
      record('default renderer renders', false, e.message);
    }
    await sleep(2000);
    await screenshot('default-dotted');

    // 9. Console + asset accounting.
    const fatalExceptions = exceptions.filter(Boolean);
    // CSP posture comes from the served headers: CDP trims violation-message
    // text (300 chars), which silently cut "report-only" off longer messages
    // and once mislabeled non-blocking notes as blocking.
    const enforcingCspHeaders = documentCsp.filter((d) => d.enforcing);
    const reportOnlyCspHeaders = documentCsp.filter((d) => !d.enforcing && d.reportOnly);
    const cspViolationNotes = logEntries.filter((l) => l.source === 'security');
    record(
      'no runtime exceptions',
      fatalExceptions.length === 0,
      fatalExceptions.length ? JSON.stringify(fatalExceptions).slice(0, 200) : undefined,
    );
    record(
      'CSP stays report-only (no enforcing header)',
      enforcingCspHeaders.length === 0,
      `${reportOnlyCspHeaders.length} report-only header(s), ${cspViolationNotes.length} violation note(s), none blocking`,
    );

    const cesiumAssets = responses.filter((r) => r.url?.includes('/cesium/'));
    const workerAssets = cesiumAssets.filter((r) => r.url?.includes('/cesium/Workers/'));
    // 304 is a cache-valid success: repeat navigations revalidate.
    const cesiumAssetOk = (r) => r.status === 200 || r.status === 304;
    record(
      'Cesium static assets serve 200/304',
      cesiumAssets.length > 0 && cesiumAssets.every(cesiumAssetOk),
      `${cesiumAssets.length} requests, ${workerAssets.length} Workers`,
    );

    // Authoritative final checks — evaluated after every step so late-arriving
    // CDP events (possible under software GL) cannot produce false failures.
    const finalChecks = [
      {
        name: 'GIBS imagery: ≥1 wmts response, all 200',
        pass: wmtsOk() > 0 && wmtsOk() === wmtsCount(),
        detail: `${wmtsOk()} × 200 of ${wmtsCount()} total`,
      },
      {
        name: 'no runtime exceptions (final tally)',
        pass: fatalExceptions.length === 0,
        detail: fatalExceptions.length ? `${fatalExceptions.length} exception(s)` : undefined,
      },
      {
        name: 'CSP: no enforcing policy header (report-only cannot block)',
        pass: enforcingCspHeaders.length === 0,
        detail: `${reportOnlyCspHeaders.length} report-only header(s), ${cspViolationNotes.length} violation note(s)`,
      },
    ];
    for (const c of finalChecks) {
      record(`final: ${c.name}`, c.pass, c.detail);
    }

    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      edge,
      edgeVersion,
      steps,
      finalChecks,
      hardChecksPassed: steps.every((s) => s.pass) && finalChecks.every((c) => c.pass),
      screenshots: shots,
      console: { errorsAndWarnings: consoleEvents, exceptions },
      log: logEntries,
      network: {
        wmts: {
          total: wmtsCount(),
          ok: wmtsOk(),
          statuses: statusHistogram(responses.filter((r) => r.url?.includes('wmts.cgi'))),
        },
        cesiumAssets: {
          total: cesiumAssets.length,
          workers: workerAssets.length,
          statuses: statusHistogram(cesiumAssets),
        },
        csp: {
          documentPolicies: documentCsp,
          violationNotes: cspViolationNotes.length,
        },
        failedLoads: failedLoads.filter((f) => !f.canceled && f.url),
      },
    };
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

    console.log('');
    console.log(`report: ${path.join(OUT_DIR, 'report.json')}`);
    console.log(`screenshots: ${OUT_DIR}`);
    if (consoleEvents.length || exceptions.length) {
      console.log('');
      console.log('console errors/warnings:');
      for (const e of [...consoleEvents, ...exceptions].slice(0, 25)) {
        console.log(`  [${e.type ?? 'exception'}] ${e.text}`);
      }
    }
    if (!report.hardChecksPassed) process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

function statusHistogram(entries) {
  const hist = {};
  for (const e of entries) {
    const key = String(e.status);
    hist[key] = (hist[key] ?? 0) + 1;
  }
  return hist;
}

main().catch((err) => {
  console.error(`smoke test failed: ${err.message}`);
  process.exitCode = 1;
});
