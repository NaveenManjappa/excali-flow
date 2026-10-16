const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const vm = require('vm');
const assert = require('assert');

const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert(scriptMatch, 'Could not find <script> block in index.html');
const scriptCode = scriptMatch[1];

// Instrumented Path2D that records every point added to it
class MockPath2D {
  constructor() {
    this.ops = [];
    this.points = [];
  }
  moveTo(x, y) {
    this.ops.push({ type: 'moveTo', x, y });
    this.points.push({ x, y });
  }
  lineTo(x, y) {
    this.ops.push({ type: 'lineTo', x, y });
    this.points.push({ x, y });
  }
  quadraticCurveTo(cpx, cpy, x, y) {
    this.ops.push({ type: 'quadraticCurveTo', cpx, cpy, x, y });
    this.points.push({ x: cpx, y: cpy }, { x, y });
  }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.ops.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    this.points.push({ x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, { x, y });
  }
  ellipse(cx, cy, rx, ry, rot, start, end) {
    this.ops.push({ type: 'ellipse', cx, cy, rx, ry, rot, start, end });
  }
  closePath() {
    this.ops.push({ type: 'closePath' });
  }
}

function createMockCtx() {
  const calls = [];
  const fontsUsed = [];
  let currentFont = '';
  return {
    calls,
    fontsUsed,
    get font() { return currentFont; },
    set font(v) { currentFont = v; fontsUsed.push(v); },
    save() { calls.push({ fn: 'save' }); },
    restore() { calls.push({ fn: 'restore' }); },
    beginPath() { calls.push({ fn: 'beginPath' }); },
    closePath() { calls.push({ fn: 'closePath' }); },
    moveTo(x, y) { calls.push({ fn: 'moveTo', x, y }); },
    lineTo(x, y) { calls.push({ fn: 'lineTo', x, y }); },
    quadraticCurveTo(cpx, cpy, x, y) { calls.push({ fn: 'quadraticCurveTo', cpx, cpy, x, y }); },
    bezierCurveTo(a, b, c, d, e, f) { calls.push({ fn: 'bezierCurveTo', a, b, c, d, e, f }); },
    arcTo(x1, y1, x2, y2, r) { calls.push({ fn: 'arcTo', x1, y1, x2, y2, r }); },
    arc(x, y, r, s, e) { calls.push({ fn: 'arc', x, y, r, s, e }); },
    ellipse(x, y, rx, ry) { calls.push({ fn: 'ellipse', x, y, rx, ry }); },
    fill(pathObj) { calls.push({ fn: 'fill', pathObj }); },
    stroke(pathObj) { calls.push({ fn: 'stroke', pathObj }); },
    clip(pathObj) { calls.push({ fn: 'clip', pathObj }); },
    fillRect(x, y, w, h) { calls.push({ fn: 'fillRect', x, y, w, h }); },
    strokeRect(x, y, w, h) { calls.push({ fn: 'strokeRect', x, y, w, h }); },
    clearRect(x, y, w, h) { calls.push({ fn: 'clearRect', x, y, w, h }); },
    setLineDash(d) { calls.push({ fn: 'setLineDash', d }); },
    setTransform() {},
    scale() {},
    translate() {},
    fillText(text, x, y) { calls.push({ fn: 'fillText', text, x, y, font: currentFont }); },
    measureText(text) { return { width: String(text || '').length * 8.5 }; }
  };
}

const mockCanvas = {
  width: 1440,
  height: 900,
  style: {},
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; },
  getAttribute(k) { return this.attrs[k]; },
  getContext: () => createMockCtx(),
  addEventListener: () => {}
};

const sandbox = {
  console,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
  Set,
  Map,
  Float64Array,
  JSON,
   Path2D: MockPath2D,
  performance: { now: () => 1234.5 },
  requestAnimationFrame: () => 1,
  setTimeout: () => 1,
  clearTimeout: () => {},
  setInterval: () => 1,
  clearInterval: () => {},
  window: {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 2,
    addEventListener: () => {}
  },
  document: {
    body: { classList: { toggle: () => {} } },
    getElementById: () => ({
      width: 1440,
      height: 900,
      style: {},
      children: [],
      classList: { toggle: () => {}, add: () => {}, remove: () => {}, contains: () => false },
      addEventListener: () => {},
      appendChild: () => {},
      getContext: () => createMockCtx()
    }),
    querySelectorAll: () => [],
    createElement: () => mockCanvas
  }
};

console.log('--- Excaliflow Automated Verification Suite ---');
assert(html.includes('Excaliflow') && !html.includes('AtelierFlow'), 'index.html should use Excaliflow branding everywhere');

// 1. Verify Zero Syntax or Runtime Initialization Errors
vm.createContext(sandbox);
vm.runInContext(scriptCode, sandbox);
sandbox.initStudioDOM();
const app = sandbox.window;
assert(app.state.elements.length > 0, 'Initial template should populate elements');
assert.strictEqual(app.createElement('rectangle').fillStyle, 'solid', 'New shapes default to a solid tint fill');
assert.strictEqual(app.createElement('rectangle').roughness, 0, 'New shapes default to Clean sloppiness');
assert.strictEqual(app.createElement('rectangle').strokeWidth, 2.2, 'New shapes default to Bold stroke');
assert.strictEqual(app.createElement('rectangle').strokeStyle, 'solid', 'New shapes default to a solid stroke');
assert.strictEqual(app.createElement('rectangle').fontFamily, 'hand', 'New shapes default to the Hand font');
assert.strictEqual(app.state.flowSpeed, 0.6, 'Flow speed defaults to 0.6x');
assert.strictEqual(app.state.flowMode, 'aurora', 'Flow animation defaults to Aurora');
assert.strictEqual(app.createElement('arrow').curveType, 'straight', 'New arrows default to straight');
assert.strictEqual(app.createElement('sticky').fillStyle, 'solid', 'Sticky notes keep a solid fill');
console.log('[PASS] 1. Zero syntax or runtime initialization errors (initial scene loaded, Excalidraw-style defaults)');

// 2. Verify Zero-Bleed Analytical Hachure & Cross-Hatch Clipping + ctx.clip(paths.fillPath)
for (const fillStyle of ['hachure', 'cross-hatch']) {
  const ellipseEl = app.createElement('ellipse', {
    x: 120,
    y: 160,
    width: 180,
    height: 110,
    fillStyle,
    roughness: 1.75
  });
  const ellipsePaths = app.ShapeCache.generate(ellipseEl);
  assert(ellipsePaths.hachurePath.points.length > 10, `Ellipse ${fillStyle} should generate hatch points`);

  const ecx = ellipseEl.x + ellipseEl.width / 2;
  const ecy = ellipseEl.y + ellipseEl.height / 2;
  const erx = ellipseEl.width / 2;
  const ery = ellipseEl.height / 2;
  for (const pt of ellipsePaths.hachurePath.points) {
    const normDist = ((pt.x - ecx) / erx) ** 2 + ((pt.y - ecy) / ery) ** 2;
    assert(
      normDist <= 1.0001,
      `Ellipse ${fillStyle} point (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) bled outside boundary: normDist=${normDist}`
    );
  }

  const diamondEl = app.createElement('diamond', {
    x: 340,
    y: 160,
    width: 190,
    height: 120,
    fillStyle,
    roughness: 1.75
  });
  const diamondPaths = app.ShapeCache.generate(diamondEl);
  assert(diamondPaths.hachurePath.points.length > 10, `Diamond ${fillStyle} should generate hatch points`);

  const dcx = diamondEl.x + diamondEl.width / 2;
  const dcy = diamondEl.y + diamondEl.height / 2;
  const dhw = diamondEl.width / 2;
  const dhh = diamondEl.height / 2;
  for (const pt of diamondPaths.hachurePath.points) {
    const l1Dist = Math.abs(pt.x - dcx) / dhw + Math.abs(pt.y - dcy) / dhh;
    assert(
      l1Dist <= 1.0001,
      `Diamond ${fillStyle} point (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) bled outside boundary: l1Dist=${l1Dist}`
    );
  }

  // Verify drawStaticElement calls ctx.clip(paths.fillPath) before stroking hachurePath
  const testCtx = createMockCtx();
  const cached = app.ShapeCache.get(ellipseEl);
  app.drawStaticElement(testCtx, ellipseEl);
  const clipIdx = testCtx.calls.findIndex(c => c.fn === 'clip' && c.pathObj === cached.fillPath);
  const hachureStrokeIdx = testCtx.calls.findIndex(c => c.fn === 'stroke' && c.pathObj === cached.hachurePath);
  assert(clipIdx !== -1, 'drawStaticElement must invoke ctx.clip(paths.fillPath)');
  assert(hachureStrokeIdx > clipIdx, 'hachurePath stroke must occur after ctx.clip(paths.fillPath)');
}
console.log('[PASS] 2. Zero-bleed analytical interior clipping & double-safety ctx.clip(paths.fillPath) verified');

// 3. Verify 1-Click Unselected Arrow Endpoint Grabbing, Perimeter Sliding (focusAngle) & Cross-Shape Rebinding
app.state.elements = [];
app.state.selectedIds.clear();
app.state.zoom = 1;

const boxA = app.createElement('rectangle', { id: 'node_A', x: 100, y: 200, width: 140, height: 80, text: 'Node A' });
const boxB = app.createElement('rectangle', { id: 'node_B', x: 420, y: 200, width: 140, height: 80, text: 'Node B' });
const boxC = app.createElement('ellipse',   { id: 'node_C', x: 420, y: 380, width: 150, height: 90, text: 'Node C' });
const arrowAB = app.createElement('arrow', {
  id: 'arrow_AB',
  x: 240,
  y: 240,
  x2: 420,
  y2: 240,
  startBinding: { elementId: 'node_A', focusAngle: 0, gap: 4 },
  endBinding: { elementId: 'node_B', focusAngle: Math.PI, gap: 4 }
});
app.state.elements.push(boxA, boxB, boxC, arrowAB);

// Ensure arrowAB is NOT selected initially
assert(!app.state.selectedIds.has('arrow_AB'), 'Arrow should start unselected');
const geomAB = app.getArrowGeometry(arrowAB);
const hitEnd = app.hitTestArrowHandle(geomAB.p1.x + 6, geomAB.p1.y - 4);
assert(hitEnd && hitEnd.elementId === 'arrow_AB' && hitEnd.handle === 'end', 'hitTestArrowHandle must grab unselected arrow endpoint');

// Verify computeBindingForShape & getBindingBoundaryPoint slide across top and bottom perimeters
const topPt = { x: boxB.x + boxB.width / 2, y: boxB.y - 2 };
const bindTop = app.computeBindingForShape(boxB, topPt);
assert(Math.abs(bindTop.focusAngle - (-Math.PI / 2)) < 0.05, 'Top perimeter focusAngle should be ~ -PI/2');
const boundTopPt = app.getBindingBoundaryPoint(boxB, bindTop, geomAB.p0, 4);
assert(Math.abs(boundTopPt.y - (boxB.y - 4)) < 1.5, 'Boundary point should lie on top edge of boxB');

const bottomPt = { x: boxB.x + boxB.width / 2, y: boxB.y + boxB.height + 2 };
const bindBottom = app.computeBindingForShape(boxB, bottomPt);
assert(Math.abs(bindBottom.focusAngle - (Math.PI / 2)) < 0.05, 'Bottom perimeter focusAngle should be ~ +PI/2');
const boundBottomPt = app.getBindingBoundaryPoint(boxB, bindBottom, geomAB.p0, 4);
assert(Math.abs(boundBottomPt.y - (boxB.y + boxB.height + 4)) < 1.5, 'Boundary point should lie on bottom edge of boxB');

// Drag arrowAB's end handle from boxB across to boxC
app.setTool('select');
app.pointerDownWorld(geomAB.p1.x, geomAB.p1.y);
app.pointerMoveWorld(boxC.x + 8, boxC.y + boxC.height / 2);
app.pointerUpWorld(boxC.x + 8, boxC.y + boxC.height / 2);
assert.strictEqual(arrowAB.endBinding?.elementId, 'node_C', 'Dragging arrow endpoint onto Node C must rebind endBinding.elementId');
console.log('[PASS] 3. 1-click unselected arrow endpoint grabbing, perimeter sliding (focusAngle), and cross-shape rebinding verified');

// 4. Verify Direct Bound-Arrow Middle Drag in Select Mode Updates arrow.curveOffset
arrowAB.curveOffset = 0;
const currentGeom = app.getArrowGeometry(arrowAB);
const midPt = currentGeom.curveHandlePt;
app.state.selectedIds.clear(); // Even without prior selection, clicking & dragging bound arrow shaft in Select mode bends curve
app.pointerDownWorld(midPt.x, midPt.y);
app.pointerMoveWorld(midPt.x - 50, midPt.y + 50);
app.pointerUpWorld(midPt.x - 50, midPt.y + 50);
assert(Math.abs(arrowAB.curveOffset) > 40, `Expected arrow.curveOffset to update when dragging middle shaft, got ${arrowAB.curveOffset}`);

// Verify Straight, Elbow (including L-bend arrowhead angle & 1:1 handle tracking), and Curved switching
app.state.selectedIds.clear();
app.state.selectedIds.add(arrowAB.id);
app.applyStyleProperty('curveType', 'straight');
assert.strictEqual(arrowAB.curveType, 'straight', 'Arrow should switch to straight');
assert.strictEqual(arrowAB.curveOffset, 0, 'Switching to straight must reset curveOffset to 0');

app.applyStyleProperty('curveType', 'elbow');
assert.strictEqual(arrowAB.curveType, 'elbow', 'Arrow should switch to elbow');
assert.strictEqual(arrowAB.curveOffset, 0, 'Switching to elbow must reset curveOffset to 0');

// Drag elbow handle to x = 460 and verify 1:1 horizontal tracking (not inverted)
const elbowGeom0 = app.getArrowGeometry(arrowAB);
app.pointerDownWorld(elbowGeom0.curveHandlePt.x, elbowGeom0.curveHandlePt.y);
app.pointerMoveWorld(460, elbowGeom0.curveHandlePt.y);
app.pointerUpWorld(460, elbowGeom0.curveHandlePt.y);
const elbowGeomDragged = app.getArrowGeometry(arrowAB);
assert(Math.abs(elbowGeomDragged.curveHandlePt.x - 460) < 2, `Elbow handle must track cursor X (460), got ${elbowGeomDragged.curveHandlePt.x}`);

// Drag elbow handle to align with p1.x (forming a 90-degree L-bend going right then straight down)
app.pointerDownWorld(elbowGeomDragged.curveHandlePt.x, elbowGeomDragged.curveHandlePt.y);
app.pointerMoveWorld(elbowGeomDragged.p1.x, elbowGeomDragged.curveHandlePt.y);
app.pointerUpWorld(elbowGeomDragged.p1.x, elbowGeomDragged.curveHandlePt.y);
const lBendGeom = app.getArrowGeometry(arrowAB);
assert.strictEqual(lBendGeom.waypoints.length, 3, 'L-bend elbow should collapse degenerate final segment into 3 waypoints');
assert(Math.abs(lBendGeom.tipAngle - Math.PI / 2) < 0.01, `L-bend vertical shaft must have downward tipAngle (+PI/2), got ${lBendGeom.tipAngle}`);

// Verify dragging elbow handle over startShape (User Task Spec scenario) exits bottom instead of cutting backwards through the shape
app.applyStyleProperty('curveType', 'elbow');
const gBefore = app.getArrowGeometry(arrowAB);
app.pointerDownWorld(gBefore.curveHandlePt.x, gBefore.curveHandlePt.y);
app.pointerMoveWorld(boxA.x + boxA.width / 2, gBefore.curveHandlePt.y);
app.pointerUpWorld(boxA.x + boxA.width / 2, gBefore.curveHandlePt.y);
const gOverStart = app.getArrowGeometry(arrowAB);
assert(Math.abs(gOverStart.p0.y - (boxA.y + boxA.height + 4)) < 2, `Elbow arrow dragged over startShape must exit from bottom of startShape, got p0=(${gOverStart.p0.x}, ${gOverStart.p0.y})`);
for (const wp of gOverStart.waypoints) {
  const insideBoxA = wp.x > boxA.x + 2 && wp.x < boxA.x + boxA.width - 2 && wp.y > boxA.y + 2 && wp.y < boxA.y + boxA.height - 2;
  assert(!insideBoxA, `Elbow waypoint (${wp.x}, ${wp.y}) must never cut through interior of startShape`);
}

// Verify Clean (0), Artist (0.85), and Cartoon (1.75) sloppiness produce clearly distinct multi-pass geometry & apply globally when unselected
const cleanRect = app.ShapeCache.generate(app.createElement('rectangle', { x: 0, y: 0, width: 140, height: 70, roughness: 0 }));
const artistRect = app.ShapeCache.generate(app.createElement('rectangle', { x: 0, y: 0, width: 140, height: 70, roughness: 0.85 }));
const cartoonRect = app.ShapeCache.generate(app.createElement('rectangle', { x: 0, y: 0, width: 140, height: 70, roughness: 1.75 }));
assert(cleanRect.strokePath.ops.length < artistRect.strokePath.ops.length, 'Artist rectangle must have more sketch passes than Clean');
assert(artistRect.strokePath.ops.length < cartoonRect.strokePath.ops.length, 'Cartoon rectangle must have more sketch passes than Artist');
app.state.selectedIds.clear();
app.applyStyleProperty('roughness', 1.75);
assert.strictEqual(boxA.roughness, 1.75, 'Clicking Cartoon with no selection must apply roughness=1.75 to existing canvas shapes');

// Switching from elbow (curveOffset=0) to curved should apply a visible curveOffset
app.state.selectedIds.add(arrowAB.id);
app.applyStyleProperty('curveType', 'straight');
app.applyStyleProperty('curveType', 'curved');
assert(Math.abs(arrowAB.curveOffset) >= 20, `Switching to curved from 0 offset should apply default curveOffset, got ${arrowAB.curveOffset}`);
console.log('[PASS] 4. Direct bound-arrow middle shaft drag + Straight, Elbow (no shape-cutting, L-bend & 1:1 handle), Curved, and Clean/Artist/Cartoon verified');

// 5. Verify Excalidraw Font Families (Excalifont/Virgil, Assistant/Nunito, Cascadia), Unbroken Arrows (no text/gaps), Tool Lock (Q), Laser Pointer (K), Number Shortcuts (1-9, 0), and triggerNodePulse
const fontTestCtx = createMockCtx();
for (const [fam, expectedSubstrs] of [
  ['hand', ['Excalifont', 'Virgil', 'Patrick Hand']],
  ['sans', ['Assistant', 'Nunito', 'Geist']],
  ['code', ['Cascadia', 'Geist Mono']]
]) {
  const fNode = app.createElement('rectangle', { x: 50, y: 50, width: 120, height: 60, text: 'Hello', fontFamily: fam });
  app.drawElementText(fontTestCtx, fNode, { forExport: true });
  const lastFont = fontTestCtx.fontsUsed[fontTestCtx.fontsUsed.length - 1];
  for (const sub of expectedSubstrs) {
    assert(lastFont.includes(sub), `Font family '${fam}' should include '${sub}', got '${lastFont}'`);
  }
}

// Verify arrows never render text or create gaps in between arrows
const arrowWithText = app.createElement('arrow', { x: 100, y: 100, x2: 300, y2: 100, text: 'ShouldNotRender' });
const arrowGeomCheck = app.getArrowGeometry(arrowWithText);
assert.strictEqual(arrowGeomCheck.labelBox, null, 'Arrows must not have labelBox');
assert.strictEqual(arrowGeomCheck.gapStartDist, -1, 'Arrows must not cut gaps in between shafts');
const arrowTextCtx = createMockCtx();
app.drawElementText(arrowTextCtx, arrowWithText, { forExport: true });
assert.strictEqual(arrowTextCtx.calls.filter(c => c.fn === 'fillText').length, 0, 'drawElementText must never write text on arrows');

// Tool Lock ('Q')
assert.strictEqual(app.state.toolLocked, false, 'Tool lock starts false');
app.handleKeyDown({ key: 'q' });
assert.strictEqual(app.state.toolLocked, true, 'Pressing Q should enable toolLock');
app.handleKeyDown({ key: 'q' });
assert.strictEqual(app.state.toolLocked, false, 'Pressing Q again should disable toolLock');

// Laser Pointer ('K')
app.handleKeyDown({ key: 'k' });
assert.strictEqual(app.state.activeTool, 'laser', 'Pressing K should select laser tool');
app.pointerDownWorld(200, 200);
app.pointerMoveWorld(240, 220);
app.pointerUpWorld(240, 220);
assert(app.state.laserPoints.length >= 2, 'Laser tool drag should record glowing trail points');

// Number shortcuts (1-9, 0)
const expectedNumberTools = {
  '1': 'select',
  '2': 'rectangle',
  '3': 'diamond',
  '4': 'ellipse',
  '5': 'arrow',
  '6': 'arrow',
  '7': 'freedraw',
  '8': 'text',
  '9': 'sticky',
  '0': 'eraser'
};
for (const [numKey, expectedTool] of Object.entries(expectedNumberTools)) {
  app.handleKeyDown({ key: numKey });
  assert.strictEqual(app.state.activeTool, expectedTool, `Shortcut '${numKey}' should activate '${expectedTool}'`);
}

// triggerNodePulse
const prevPulseCount = app.state.activePulses.length;
const spawned = app.triggerNodePulse('node_A');
assert(spawned > 0 && app.state.activePulses.length > prevPulseCount, 'triggerNodePulse should spawn active burst packets along outgoing arrows');
assert(html.includes('<span>Excaliflow</span>') && !html.includes('AtelierFlow'), 'Brand name must be Excaliflow everywhere');
console.log('[PASS] 5. Font families (Hand/Sans/Code), Tool Lock (Q), Laser Pointer (K), shortcuts (1-9, 0), and triggerNodePulse verified');

// 6. Verify Port-Wire Drag to Empty Canvas, Undo Stack Click Integrity & Subgraph Cloning
app.setTool('select');
app.state.selectedIds.clear();
app.state.selectedIds.add('node_A');
app.state.history.undoStack = [];
const undoCountBeforeClick = app.state.history.undoStack.length;
// Click on node_A without moving it
app.pointerDownWorld(boxA.x + 20, boxA.y + 20);
app.pointerUpWorld(boxA.x + 20, boxA.y + 20);
assert.strictEqual(app.state.history.undoStack.length, undoCountBeforeClick, 'Clicking a node without moving must not leave a no-op snapshot on undoStack');

// Drag from node_A right quick-connect port onto empty canvas (800, 500)
const rightPortX = boxA.x + boxA.width + 18;
const rightPortY = boxA.y + boxA.height / 2;
const elemCountBeforeWire = app.state.elements.length;
app.pointerDownWorld(rightPortX, rightPortY);
app.pointerMoveWorld(800, 500);
app.pointerUpWorld(800, 500);
assert.strictEqual(app.state.elements.length, elemCountBeforeWire + 2, 'Dragging port-wire onto empty canvas must create a connected node + arrow');

// Clone subgraph and verify internal bindings remap
const cloned = app.cloneElementsWithBindings([boxA, boxC, arrowAB], 40, 40);
assert.strictEqual(cloned.length, 3, 'Should clone 3 elements');
const clonedArrow = cloned.find(c => c.type === 'arrow');
assert(clonedArrow.startBinding.elementId !== 'node_A' && clonedArrow.endBinding.elementId !== 'node_C', 'Cloned arrow bindings must remap to cloned node IDs');
console.log('[PASS] 6. Port-wire drag to empty canvas, no-op click undo guard, and subgraph binding clone verified');

// 7. Verify Untrusted JSON Import Validation, Excalidraw points[] Arrow Import, and server.js Security Guards
const importedOk = app.importExcalidrawJson(JSON.stringify({
  elements: [
    { id: 'imp_box', type: 'rectangle', x: 100, y: 100, width: 140, height: 70, text: 'Valid' },
    { id: 'imp_bad', type: 'script_injection', x: 0, y: 0, width: 50, height: 50 },
    { id: 'imp_arr', type: 'arrow', x: 300, y: 200, points: [[0, 0], [-120, 60]] }
  ],
  appState: {
    flowMode: 'invalid_mode_xyz',
    flowSpeed: 9999
  }
}));
assert.strictEqual(importedOk, true, 'importExcalidrawJson should succeed on valid JSON payload');
assert.strictEqual(app.state.elements.length, 2, 'Untrusted element types must be filtered out on import');
const impArr = app.state.elements.find(e => e.id === 'imp_arr');
assert.strictEqual(impArr.x2, 180, 'Excalidraw arrow points[[0,0],[-120,60]] must resolve x2 = x - 120');
assert.strictEqual(impArr.y2, 260, 'Excalidraw arrow points[[0,0],[-120,60]] must resolve y2 = y + 60');
assert.notStrictEqual(app.state.flowMode, 'invalid_mode_xyz', 'Invalid flowMode must be rejected');
assert.strictEqual(app.state.flowSpeed, 5, 'Out-of-bounds flowSpeed must be clamped to <= 5.0');

// Test server.js request handling & security guards in-memory
const server = require('./server.js');
function runMockReq(method, url) {
  let statusCode = 200;
  let headers = {};
  let body = '';
  const req = { method, url };
  const res = {
    writeHead(code, hdrs) { statusCode = code; headers = hdrs || {}; },
    end(chunk) { if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk); }
  };
  server.emit('request', req, res);
  return new Promise(resolve => setTimeout(() => resolve({ statusCode, headers, body }), 25));
}

// API requests need a readable body and resolve once the response has ended
function apiReq(method, url, { body, headers = {} } = {}) {
  return new Promise(resolve => {
    const chunks = body === undefined ? [] : [Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
    const req = Readable.from(chunks);
    req.method = method;
    req.url = url;
    req.headers = {
      host: 'localhost:3000',
      'x-excaliflow': '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers
    };
    let statusCode = 200;
    let resHeaders = {};
    let out = '';
    const res = {
      writeHead(code, hdrs) { statusCode = code; resHeaders = hdrs || {}; },
      end(chunk) {
        if (chunk) out += String(chunk);
        let json = null;
        try { json = JSON.parse(out); } catch { /* not JSON */ }
        resolve({ statusCode, headers: resHeaders, body: out, json });
      }
    };
    server.emit('request', req, res);
  });
}

(async () => {
  const postRes = await runMockReq('POST', '/index.html');
  assert.strictEqual(postRes.statusCode, 405, 'POST requests must be rejected with 405');

  const badUriRes = await runMockReq('GET', '/%E0%A4%A');
  assert.strictEqual(badUriRes.statusCode, 400, 'Malformed URI encoding must return 400');

  const travRes = await runMockReq('GET', '/../package.json');
  assert.strictEqual(travRes.statusCode, 403, 'Path traversal outside ROOT must return 403');

  const headRes = await runMockReq('HEAD', '/');
  assert.strictEqual(headRes.statusCode, 200, 'HEAD / must return 200');
  assert.strictEqual(headRes.body, '', 'HEAD / response must have empty body');
  assert(Number(headRes.headers['Content-Length']) > 1000, 'HEAD / must include Content-Length');

  console.log('[PASS] 7. Untrusted JSON import validation, Excalidraw arrow points[] import, and server.js security verified');

  // 8. Verify the server.js workspace API (projects = folders, canvases = .excaliflow files)
  const wsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'excaliflow-ws-'));
  server.setWorkspaceRoot(wsRoot);
  try {
    const noHeader = await apiReq('GET', '/api/workspace', { headers: { 'x-excaliflow': undefined } });
    assert.strictEqual(noHeader.statusCode, 403, 'API requests without X-Excaliflow must be rejected');
    const foreignHost = await apiReq('GET', '/api/workspace', { headers: { host: 'evil.example:3000' } });
    assert.strictEqual(foreignHost.statusCode, 403, 'API requests with a foreign Host must be rejected (DNS rebinding)');
    const plainText = await apiReq('POST', '/api/projects', { body: { name: 'X' }, headers: { 'content-type': 'text/plain' } });
    assert.strictEqual(plainText.statusCode, 415, 'API writes must require a JSON content type (forces CORS preflight)');

    const empty = await apiReq('GET', '/api/workspace');
    assert.strictEqual(empty.statusCode, 200);
    assert.deepStrictEqual(empty.json.projects, [], 'Fresh workspace should list no projects');

    const proj = await apiReq('POST', '/api/projects', { body: { name: 'Payments' } });
    assert.strictEqual(proj.statusCode, 201);
    assert.strictEqual(proj.json.id, 'Payments');
    const dupProj = await apiReq('POST', '/api/projects', { body: { name: 'payments' } });
    assert.strictEqual(dupProj.json.id, 'payments 2', 'Project names must be made unique case-insensitively');
    const sneaky = await apiReq('POST', '/api/projects', { body: { name: '../../escape' } });
    assert.strictEqual(sneaky.json.id, 'escape', 'Path separators and leading dots must be stripped from new names');
    assert(fs.existsSync(path.join(wsRoot, 'escape')), 'Sanitized project folder must be created inside the workspace');

    const created = await apiReq('POST', '/api/projects/Payments/canvases', { body: { name: 'Checkout.excaliflow' } });
    assert.strictEqual(created.statusCode, 201);
    assert.strictEqual(created.json.id, 'Checkout', 'A trailing .excaliflow in a new canvas name must be dropped');
    const canvasFile = path.join(wsRoot, 'Payments', 'Checkout.excaliflow');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(canvasFile, 'utf8')).elements, [], 'New canvas file should hold an empty scene');

    const read = await apiReq('GET', '/api/projects/Payments/canvases/Checkout');
    assert.strictEqual(read.statusCode, 200);
    const modified = Number(read.headers['X-Modified']);
    assert(Number.isFinite(modified), 'Canvas reads must include X-Modified');

    const badBody = await apiReq('PUT', '/api/projects/Payments/canvases/Checkout', { body: 'not json' });
    assert.strictEqual(badBody.statusCode, 400, 'Non-JSON canvas bodies must be rejected');
    const noElements = await apiReq('PUT', '/api/projects/Payments/canvases/Checkout', { body: { hello: 1 } });
    assert.strictEqual(noElements.statusCode, 400, 'Canvas bodies without an elements array must be rejected');

    const scene = { type: 'excaliflow', version: 2, elements: [{ id: 'n1', type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }] };
    const saved = await apiReq('PUT', '/api/projects/Payments/canvases/Checkout', {
      body: scene,
      headers: { 'if-unmodified-since-ms': String(modified) }
    });
    assert.strictEqual(saved.statusCode, 200, 'PUT with the current mtime must succeed');
    assert.strictEqual(JSON.parse(fs.readFileSync(canvasFile, 'utf8')).elements[0].id, 'n1', 'PUT must write the canvas file');
    assert.deepStrictEqual(fs.readdirSync(path.join(wsRoot, 'Payments')), ['Checkout.excaliflow'], 'Atomic writes must not leave temp files');

    const stale = await apiReq('PUT', '/api/projects/Payments/canvases/Checkout', {
      body: scene,
      headers: { 'if-unmodified-since-ms': String(modified - 10000) }
    });
    assert.strictEqual(stale.statusCode, 409, 'PUT with a stale mtime must return 409 Conflict');

    const huge = await apiReq('PUT', '/api/projects/Payments/canvases/Checkout', { body: Buffer.alloc(10 * 1024 * 1024 + 1, 32) });
    assert.strictEqual(huge.statusCode, 413, 'Bodies over 10 MB must be rejected with 413');

    for (const url of ['/api/projects/..%2F..%2Fetc/canvases/passwd', '/api/projects/%2E%2E/canvases/x', '/api/projects/Payments/canvases/..%2F..%2Fx']) {
      const trav = await apiReq('GET', url);
      assert([400, 403].includes(trav.statusCode), `Traversal ${url} must be rejected, got ${trav.statusCode}`);
    }

    const renamedCanvas = await apiReq('PATCH', '/api/projects/Payments/canvases/Checkout', { body: { name: 'Checkout v2' } });
    assert.strictEqual(renamedCanvas.json.id, 'Checkout v2');
    assert(fs.existsSync(path.join(wsRoot, 'Payments', 'Checkout v2.excaliflow')) && !fs.existsSync(canvasFile), 'Canvas rename must rename the file');

    const renamedProject = await apiReq('PATCH', '/api/projects/Payments', { body: { name: 'Billing' } });
    assert.strictEqual(renamedProject.json.id, 'Billing');
    assert(fs.existsSync(path.join(wsRoot, 'Billing', 'Checkout v2.excaliflow')), 'Project rename must rename the folder');

    const delCanvas = await apiReq('DELETE', '/api/projects/Billing/canvases/Checkout%20v2');
    assert.strictEqual(delCanvas.statusCode, 200);
    assert.strictEqual(fs.readdirSync(path.join(wsRoot, '.trash')).length, 1, 'Deleted canvases must be moved to .trash');
    const delProject = await apiReq('DELETE', '/api/projects/Billing');
    assert.strictEqual(delProject.statusCode, 200);
    assert.strictEqual(fs.readdirSync(path.join(wsRoot, '.trash')).length, 2, 'Deleted projects must be moved to .trash');

    const listing = await apiReq('GET', '/api/workspace');
    assert.deepStrictEqual(listing.json.projects.map(p => p.id), ['escape', 'payments 2'], 'Listing must hide .trash and deleted projects');

    const postStatic = await runMockReq('POST', '/index.html');
    assert.strictEqual(postStatic.statusCode, 405, 'Static files must still reject non-GET/HEAD methods');
  } finally {
    fs.rmSync(wsRoot, { recursive: true, force: true });
  }
  console.log('[PASS] 8. Workspace API: projects/canvases CRUD, .trash deletes, 409 conflicts, size/type/host/traversal guards verified');

  // 9. Verify client workspace session: open/switch canvases, autosave dirtiness, conflicts, scene round-trip
  assert.strictEqual(app.sanitizeName('../x'), 'x');
  assert.strictEqual(app.sanitizeName('a/b\\c'), 'abc');
  assert.strictEqual(app.sanitizeName('  .hidden  '), 'hidden');
  assert.strictEqual(app.sanitizeName(''), '');
  assert.strictEqual(app.uniqueName('Untitled', ['untitled', 'Untitled 2']), 'Untitled 3');

  const roundTrip = app.parseSceneJson(JSON.stringify(app.serializeScene()));
  assert.strictEqual(roundTrip.elements.length, app.state.elements.length, 'serializeScene → parseSceneJson must round-trip elements');
  assert(roundTrip.appState.camera, 'serializeScene must carry the camera');
  assert.strictEqual(app.parseSceneJson('nope'), null, 'parseSceneJson must reject invalid JSON');
  assert.strictEqual(app.parseSceneJson('{"elements":5}'), null, 'parseSceneJson must reject a non-array elements field');
  assert.strictEqual(app.parseSceneJson('{"elements":[],"appState":{"flowMode":"evil"}}').appState.flowMode, undefined, 'parseSceneJson must drop invalid flow modes');

  const store = app.createMemoryStore();
  assert.strictEqual(await app.connectWorkspace(store), true, 'connectWorkspace should open a canvas');
  const ws = app.state.workspace;
  assert.strictEqual(ws.projectId, 'My Project', 'Empty workspace should get a starter project');
  assert.strictEqual(ws.canvasId, 'Getting Started', 'Empty workspace should get a starter canvas');
  assert(app.state.elements.length > 0, 'Starter canvas should hold the template');
  assert(JSON.parse((await store.readCanvas('My Project', 'Getting Started')).text).elements.length > 0, 'Starter template must be saved to the file');
  assert.strictEqual(app.isCanvasDirty(), false);

  app.state.elements.push(app.createElement('rectangle', { id: 'ws_box', x: 10, y: 10, width: 100, height: 50 }));
  assert.strictEqual(app.isCanvasDirty(), true, 'Adding an element must mark the canvas dirty');
  assert.strictEqual(await app.flushSave(), true);
  assert.strictEqual(app.isCanvasDirty(), false, 'flushSave must clear the dirty state');
  assert(JSON.parse((await store.readCanvas('My Project', 'Getting Started')).text).elements.some(e => e.id === 'ws_box'), 'flushSave must write the element');
  const savedScrollX = app.state.scrollX;
  app.state.scrollX += 500;
  app.state.zoom = 2;
  assert.strictEqual(app.isCanvasDirty(), false, 'Camera-only changes must not mark the canvas dirty');
  app.renderScenePasses(createMockCtx(), 1.5);
  assert.strictEqual(app.isCanvasDirty(), false, 'Rendering must not mark the canvas dirty');

  assert.strictEqual(await app.newCanvas('My Project', 'Second'), 'Second');
  assert.strictEqual(ws.canvasId, 'Second');
  assert.strictEqual(app.state.elements.length, 0, 'A new canvas starts empty');
  app.pushHistory();
  app.state.elements.push(app.createElement('ellipse', { id: 'ws_second', x: 0, y: 0, width: 80, height: 40 }));
  assert(app.state.history.undoStack.length > 0);

  assert.strictEqual(await app.openCanvas('My Project', 'Getting Started'), true);
  assert(JSON.parse((await store.readCanvas('My Project', 'Second')).text).elements.some(e => e.id === 'ws_second'), 'Switching canvases must save the previous one first');
  assert(app.state.elements.some(e => e.id === 'ws_box'), 'openCanvas must load the target canvas elements');
  assert.strictEqual(app.state.history.undoStack.length, 0, 'openCanvas must empty the undo stack');
  assert.strictEqual(app.state.history.redoStack.length, 0, 'openCanvas must empty the redo stack');
  assert.strictEqual(app.state.scrollX, savedScrollX, 'openCanvas must restore the saved camera');

  // Simulate an edit on disk (e.g. git pull) while the canvas is open
  await store.writeCanvas('My Project', 'Getting Started', JSON.stringify({ elements: [{ id: 'disk_only', type: 'rectangle', x: 0, y: 0, width: 20, height: 20 }] }));
  app.state.elements.push(app.createElement('rectangle', { id: 'ws_local', x: 300, y: 0, width: 60, height: 30 }));
  assert.strictEqual(await app.flushSave(), false, 'Saving over an externally changed file must fail');
  assert.strictEqual(ws.status, 'conflict');
  assert.strictEqual(await app.openCanvas('My Project', 'Second'), false, 'Switching away during a conflict must be blocked');
  await app.resolveConflict('reload');
  assert.deepStrictEqual(app.state.elements.map(e => e.id), ['disk_only'], 'Reload from disk must load the external version');
  assert.strictEqual(ws.status, 'saved');

  app.state.elements.push(app.createElement('rectangle', { id: 'ws_after', x: 0, y: 100, width: 60, height: 30 }));
  await store.writeCanvas('My Project', 'Getting Started', JSON.stringify({ elements: [] }));
  assert.strictEqual(await app.flushSave(), false);
  await app.resolveConflict('copy');
  assert.strictEqual(ws.canvasId, 'Getting Started copy', 'Save as copy must switch to the new canvas');
  assert(JSON.parse((await store.readCanvas('My Project', 'Getting Started copy')).text).elements.some(e => e.id === 'ws_after'), 'Save as copy must keep local edits');
  console.log('[PASS] 9. Client workspace: starter canvas, autosave dirtiness (camera excluded), switch-saves, undo reset, conflict reload/copy verified');

  // 10. Flow modes None/Aurora, canvas backgrounds, Excalidraw-style defaults, letter shortcuts
  assert.strictEqual(app.parseSceneJson('{"elements":[],"appState":{"flowMode":"none"}}').appState.flowMode, 'none', 'flowMode "none" must survive parsing');
  assert.strictEqual(app.parseSceneJson('{"elements":[],"appState":{"flowMode":"aurora"}}').appState.flowMode, 'aurora', 'flowMode "aurora" must survive parsing');
  assert.strictEqual(app.parseSceneJson('{"elements":[],"appState":{"viewBackgroundColor":"red;x"}}').appState.viewBackgroundColor, undefined, 'Non-hex backgrounds must be dropped');

  const flowA = app.createElement('rectangle', { id: 'flow_A', x: 0, y: 0, width: 100, height: 60 });
  const flowB = app.createElement('rectangle', { id: 'flow_B', x: 500, y: 0, width: 100, height: 60 });
  const flowArrow = app.createElement('arrow', {
    id: 'flow_AB', x: 100, y: 30, x2: 500, y2: 30,
    startBinding: { elementId: 'flow_A', focusAngle: 0, gap: 4 },
    endBinding: { elementId: 'flow_B', focusAngle: Math.PI, gap: 4 }
  });
  app.state.elements = [flowA, flowB, flowArrow];
  app.state.activePulses = [];
  app.state.flowEnabled = true;
  const countArcs = mode => {
    app.state.flowMode = mode;
    const c = createMockCtx();
    app.renderScenePasses(c, 1.3, { canvasBg: '#ffffff' });
    return c.calls.filter(x => x.fn === 'arc').length;
  };
  assert(countArcs('comets') > 0, 'Comets mode must draw particles');
  assert.strictEqual(countArcs('none'), 0, 'Flow mode "none" must draw no ambient particles');
  assert(app.triggerNodePulse('flow_A') > 0, 'Pulse bursts must still spawn in "none" mode');

  for (const bg of ['#ffffff', '#000000']) {
    const c = createMockCtx();
    const styles = [];
    let composite = 'source-over';
    Object.defineProperty(c, 'globalCompositeOperation', { get: () => composite, set: v => { composite = v; } });
    const origStroke = c.stroke;
    c.stroke = function (p) { styles.push({ color: this.strokeStyle, composite }); origStroke.call(this, p); };
    app.drawFlowParticleAt(c, app.getArrowGeometry(flowArrow), 200, 0.5, '#171717', 2.2, 'aurora', bg);
    assert(new Set(styles.map(s => s.color)).size > 3, `Aurora trail must blend warm→cool colors on ${bg}`);
    assert.strictEqual(styles.some(s => s.composite === 'lighter'), bg === '#000000', `Aurora must glow additively only on dark canvases (${bg})`);
  }

  assert.strictEqual(app.isDarkBackground('#000000'), true);
  assert.strictEqual(app.isDarkBackground('#1e1e1e'), true);
  assert.strictEqual(app.isDarkBackground('#fffce8'), false);
  app.setCanvasBackground('#FFFCE8');
  assert.strictEqual(app.state.canvasBg, '#fffce8', 'Preset backgrounds must be applied (normalized to lowercase)');
  app.setCanvasBackground('javascript:alert(1)');
  assert.strictEqual(app.state.canvasBg, '#ffffff', 'Invalid backgrounds must fall back to white');

  // Dark theme is separate from the background color, like Excalidraw (invert(93%) hue-rotate(180deg))
  assert.strictEqual(app.state.theme, 'light', 'Theme defaults to light');
  const keyBeforeTheme = app.sceneContentKey();
  app.handleKeyDown({ key: 'Î', code: 'KeyD', altKey: true, shiftKey: true });
  assert.strictEqual(app.state.theme, 'dark', 'Alt+Shift+D must toggle dark theme');
  assert.strictEqual(app.state.canvasBg, '#ffffff', 'Dark theme must not change the stored background');
  assert.strictEqual(app.getEffectiveCanvasBg(), '#121212', 'White renders as #121212 in dark theme');
  assert(app.isDarkBackground(app.applyDarkThemeFilter('#fffce8')), 'Light presets render dark in dark theme');
  assert.strictEqual(app.sceneContentKey(), keyBeforeTheme, 'Toggling the theme must not make the canvas dirty');
  app.toggleTheme();
  assert.strictEqual(app.getEffectiveCanvasBg(), '#ffffff', 'Light theme renders the background as-is');


  for (const [k, tool] of Object.entries({ v: 'select', r: 'rectangle', d: 'diamond', o: 'ellipse', a: 'arrow', p: 'freedraw', t: 'text', n: 'sticky', e: 'eraser', h: 'hand' })) {
    app.handleKeyDown({ key: k });
    assert.strictEqual(app.state.activeTool, tool, `Letter shortcut '${k}' should activate '${tool}'`);
  }
  app.setTool('select');
  app.state.flowMode = 'comets';
  console.log('[PASS] 10. Flow None/Aurora (light & dark), canvas background presets & validation, letter shortcuts verified');

  // 11. Flow Stories: auto-draft, authoring, persistence & sanitizing, presenter keys, spotlight rendering
  // Sandbox arrays come from another realm, so normalize before deepStrictEqual
  const plain = v => JSON.parse(JSON.stringify(v));
  app.stopStory();
  app.loadTemplate('RAG Pipeline');
  const autoSteps = app.state.story.steps;
  // Depths: User Query 0, Embedding 1, Vector DB + LLM 2, Reranker 3 → overview + 4 layers
  assert.strictEqual(autoSteps.length, 5, 'Templates ship with an auto-drafted story: overview + one step per depth layer');
  assert.deepStrictEqual(plain(autoSteps[0].focusIds), [], 'Auto-story opens with an overview step');
  assert.deepStrictEqual(plain(autoSteps[1].focusIds), ['r_q'], 'First layer step spotlights the root node only');
  assert.strictEqual(autoSteps[1].caption, 'User Query', 'Layer captions come from node labels');
  assert(autoSteps[2].focusIds.includes('r_emb'), 'Second layer spotlights the embedding node');
  assert(autoSteps[2].focusIds.some(id => app.state.elements.find(el => el.id === id)?.type === 'arrow'),
    'Layer steps include the arrows that deliver into the layer');
  assert.strictEqual(autoSteps[2].caption, 'Embedding Encoder', 'Multi-line labels collapse to one line');

  const keyBeforeStoryEdit = app.sceneContentKey();
  app.state.selectedIds = new Set(['r_vec', 'r_llm']);
  const custom = app.addStoryStepFromSelection();
  assert.deepStrictEqual(Array.from(custom.focusIds).sort(), ['r_llm', 'r_vec'], '+ Step spotlights exactly the selection');
  assert.notStrictEqual(app.sceneContentKey(), keyBeforeStoryEdit, 'Story edits must make the canvas dirty');
  app.state.selectedIds.clear();
  const overviewStep = app.addStoryStepFromSelection();
  assert.deepStrictEqual(plain(overviewStep.focusIds), [], 'With nothing selected, + Step adds an overview step');
  assert(app.setStoryCaption(custom.id, '  Retrieve & answer  '), 'Captions are editable');
  assert.strictEqual(custom.caption, 'Retrieve & answer', 'Captions are trimmed');
  assert(app.deleteStoryStep(overviewStep.id) && app.state.story.steps.length === 6, 'Steps can be deleted');

  const storyRoundTrip = app.parseSceneJson(JSON.stringify(app.serializeScene()));
  assert.deepStrictEqual(plain(storyRoundTrip.appState.story), plain(app.state.story),
    'Story round-trips through save and load');
  const hostileStory = app.sanitizeStory({
    steps: [
      { id: '<script>', caption: 42, focusIds: ['ok', 7, '', 'x'.repeat(200), 'ok'] },
      'nope',
      { id: 'dup', caption: 'y'.repeat(400) },
      { id: 'dup', caption: 'second' },
      ...Array.from({ length: 150 }, (_, i) => ({ id: `s${i}`, caption: 'c', focusIds: [] }))
    ]
  });
  assert.strictEqual(hostileStory.steps.length, 100, 'Stories are capped at 100 steps');
  assert.notStrictEqual(hostileStory.steps[0].id, '<script>', 'Unsafe step ids are regenerated');
  assert.strictEqual(hostileStory.steps[0].caption, '', 'Non-string captions are dropped');
  assert.deepStrictEqual(plain(hostileStory.steps[0].focusIds), ['ok'], 'focusIds keep only unique, sane strings');
  assert.strictEqual(hostileStory.steps[1].caption.length, 280, 'Captions are capped at 280 chars');
  assert.notStrictEqual(hostileStory.steps[2].id, 'dup', 'Duplicate step ids are regenerated');
  assert.deepStrictEqual(plain(app.sanitizeStory('garbage')), { steps: [] }, 'Non-object stories sanitize to empty');
  assert.deepStrictEqual(plain(app.parseSceneJson(JSON.stringify({ elements: [], appState: { story: { steps: 'x' } } })).appState.story), { steps: [] },
    'Malformed story JSON never breaks scene loading');

  // Presenter mode: navigation and camera moves never dirty the canvas
  const keyBeforePlay = app.sceneContentKey();
  assert.strictEqual(app.getStoryFocusSet(), null, 'No spotlight while stopped');
  app.state.activePulses = [];
  assert(app.startStory(), 'Story starts');
  assert.strictEqual(app.state.storyPlayer.index, 0, 'Playback starts on step 1');
  assert.strictEqual(app.getStoryFocusSet(), null, 'Overview step dims nothing');
  assert(app.state.activePulses.length > 0, 'Overview step fires bursts from the flow roots');
  app.handleKeyDown({ key: 'ArrowRight' });
  assert.strictEqual(app.state.storyPlayer.index, 1, 'ArrowRight advances');
  assert.deepStrictEqual(Array.from(app.getStoryFocusSet()), ['r_q'], 'Spotlight follows the current step');
  app.handleKeyDown({ key: ' ' });
  app.handleKeyDown({ key: 'ArrowLeft' });
  assert.strictEqual(app.state.storyPlayer.index, 1, 'Space advances and ArrowLeft goes back');
  app.handleKeyDown({ key: 'r' });
  assert.strictEqual(app.state.activeTool, 'select', 'Tool shortcuts are swallowed while presenting');
  app.handleKeyDown({ key: 'Delete' });
  assert(app.state.elements.some(el => el.id === 'r_q'), 'Delete never edits the diagram while presenting');
  const tween = app.state.storyPlayer.tween;
  assert(tween && tween.to.zoom > 0, 'Each step glides the camera to frame its spotlight');
  app.advanceStoryTween(0);
  app.advanceStoryTween(10);
  assert.strictEqual(app.state.storyPlayer.tween, null, 'Camera glide completes');
  assert.strictEqual(app.state.zoom, tween.to.zoom, 'Camera lands on the step framing');
  app.pointerDownWorld(0, 0, {});
  app.pointerUpWorld(0, 0);
  assert.strictEqual(app.state.storyPlayer.index, 2, 'Clicking the canvas advances the story');

  // Spotlight rendering: unfocused layer, veil over the whole world, then the focused layer
  const spotCtx = createMockCtx();
  app.renderScenePasses(spotCtx, 0, { focusSet: app.getStoryFocusSet(), canvasBg: '#ffffff' });
  const veilIdx = spotCtx.calls.findIndex(c => c.fn === 'fillRect' && c.w >= 1e6);
  assert(veilIdx > 0, 'Spotlight draws a veil over unfocused elements');
  assert(spotCtx.calls.slice(veilIdx).some(c => c.fn === 'fillText' && /Embedding/.test(c.text)), 'Focused labels draw above the veil');
  assert(!spotCtx.calls.slice(veilIdx).some(c => c.fn === 'fillText' && /Reranker/.test(c.text)), 'Unfocused labels stay under the veil');
  const plainCtx = createMockCtx();
  app.renderScenePasses(plainCtx, 0, {});
  assert(!plainCtx.calls.some(c => c.fn === 'fillRect' && c.w >= 1e6), 'No veil outside story playback');

  app.handleKeyDown({ key: 'Escape' });
  assert(!app.state.storyPlayer.playing && app.state.storyPlayer.index === -1, 'Escape exits the story');
  app.advanceStoryTween(20);
  app.advanceStoryTween(30);
  assert.strictEqual(app.sceneContentKey(), keyBeforePlay, 'Presenting never makes the canvas dirty');
  app.handleKeyDown({ key: 'P', shiftKey: true });
  assert(app.state.storyPlayer.playing, 'Shift+P starts the story');
  app.stopStory();
  app.handleKeyDown({ key: 'r' });
  assert.strictEqual(app.state.activeTool, 'rectangle', 'Tool shortcuts work again after the story ends');
  app.setTool('select');

  // Applying a scene replaces the story; one keystroke still presents a story-less diagram
  app.applyScene({ elements: app.parseSceneJson(JSON.stringify(app.serializeScene())).elements, appState: {} });
  assert.strictEqual(app.state.story.steps.length, 0, 'Scenes without a story load with an empty story');
  assert(app.startStory() && app.state.story.steps.length === 5, 'Playing with no steps drafts an auto-story first');
  app.stopStory();

  // Templates open as a new canvas and never overwrite the canvas you are on
  assert(app.state.workspace.store, 'Workspace store is still connected from section 9');
  await app.flushSave();
  const wsBefore = { ...app.state.workspace };
  const keyOfOpenCanvas = app.sceneContentKey();
  const templateCanvas = await app.openTemplate('Microservices');
  assert.strictEqual(templateCanvas, 'Microservices', 'Template opens as a canvas named after the template');
  assert.strictEqual(app.state.workspace.projectId, wsBefore.projectId, 'Template canvas lands in the current project');
  assert.strictEqual(app.state.workspace.canvasId, 'Microservices', 'The new template canvas becomes the open canvas');
  assert(!app.isCanvasDirty(), 'The new template canvas is saved immediately');
  assert.strictEqual(app.state.history.undoStack.length, 0, 'Template canvas starts with empty undo history');
  assert(app.state.story.steps.length > 0, 'Template canvas comes with its auto-story');
  await app.openCanvas(wsBefore.projectId, wsBefore.canvasId);
  assert.strictEqual(app.sceneContentKey(), keyOfOpenCanvas, 'The previously open canvas is left untouched');
  assert.strictEqual(await app.openTemplate('Microservices'), 'Microservices 2', 'Repeated templates get unique canvas names');
  console.log('[PASS] 11. Flow Stories: auto-draft, authoring, save/load sanitizing, presenter keys & clicks, camera glide, spotlight veil, templates open as new canvases verified');

  // 12. Excalidraw-style text tool: T on empty canvas = free text box at the cursor, T on a shape = its label
  const textCountBefore = app.state.elements.length;
  const undoBeforeText = app.state.history.undoStack.length;
  app.setTool('text');
  app.pointerDownWorld(5000, 5000, {});
  app.pointerUpWorld(5000, 5000);
  const freeText = app.state.elements[app.state.elements.length - 1];
  assert.strictEqual(freeText.type, 'text', 'T on empty canvas creates a text element');
  assert.strictEqual(freeText.text, '', 'New text starts empty (no "Label" placeholder)');
  assert.strictEqual(freeText.textAlign, 'left', 'Free text is left-aligned like Excalidraw');
  assert.strictEqual(app.state.editingId, freeText.id, 'The editor opens immediately');
  assert.strictEqual(app.state.activeTool, 'select', 'Tool returns to select after placing text');
  const anchorX = freeText.x;
  const anchorY = freeText.y;
  assert(Math.abs(anchorX + 4 - 5000) < 0.01, 'Text starts at the click point');
  const emptyWidth = freeText.width;
  app.commitInlineEditor('Hello world');
  assert.strictEqual(freeText.text, 'Hello world', 'Typed text is committed');
  assert(freeText.width > emptyWidth, 'Free text grows as you type');
  assert.strictEqual(freeText.x, anchorX, 'Free text grows to the right (left edge stays put)');
  assert.strictEqual(freeText.y, anchorY, 'Free text keeps its top edge');
  const textCtx = createMockCtx();
  app.drawElementText(textCtx, freeText, { canvasBg: '#ffffff' });
  const drawn = textCtx.calls.find(c => c.fn === 'fillText');
  assert(drawn && Math.abs(drawn.x - (anchorX + 4)) < 0.01, 'Free text renders from its left edge');
  const oneLineH = freeText.height;
  app.autoFitElementToText(freeText, 'Line one\nLonger line two');
  assert(freeText.height > oneLineH && freeText.x === anchorX && freeText.y === anchorY, 'New lines grow the box downward');
  app.autoFitElementToText(freeText, 'Hi');
  assert(freeText.width < 40, 'Free text shrinks back when text is deleted');
  app.autoFitElementToText(freeText, 'Hello world');

  app.setTool('text');
  app.pointerDownWorld(7000, 7000, {});
  app.commitInlineEditor('   ');
  assert.strictEqual(app.state.elements.length, textCountBefore + 1, 'Text left empty is discarded');
  assert.strictEqual(app.state.history.undoStack.length, undoBeforeText + 1, 'Placing + typing text is one undo step, and discarded empty text leaves none');
  app.undo();
  assert(!app.state.elements.some(el => el.id === freeText.id), 'One undo removes the typed text box');
  app.redo();
  const restoredText = app.state.elements.find(el => el.id === freeText.id);
  assert(restoredText && restoredText.text === 'Hello world', 'Redo brings it back');

  const labelTarget = app.state.elements.find(el => el.type === 'rectangle');
  app.setTool('text');
  app.pointerDownWorld(labelTarget.x + labelTarget.width / 2, labelTarget.y + labelTarget.height / 2, {});
  assert.strictEqual(app.state.editingId, labelTarget.id, 'T on a shape edits that shape\'s label');
  assert.strictEqual(app.state.elements.length, textCountBefore + 1, 'T on a shape does not create a separate text element');
  app.commitInlineEditor('Renamed service');
  assert.strictEqual(labelTarget.text, 'Renamed service', 'Shape label updated through the text tool');

  assert.strictEqual(app.createElement('text', { text: 'legacy' }).textAlign, 'center', 'Older text elements keep centered rendering');
  const reloaded = app.parseSceneJson(JSON.stringify(app.serializeScene())).elements.find(el => el.id === restoredText.id);
  assert.strictEqual(reloaded.textAlign, 'left', 'textAlign survives save and load');
  console.log('[PASS] 12. Defaults (Solid, Bold/Solid, Clean, Hand, Aurora 0.6x) and Excalidraw-style text tool verified');

  console.log('\nALL EXCALIFLOW VERIFICATION CHECKS PASSED SUCCESSFULLY!');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
