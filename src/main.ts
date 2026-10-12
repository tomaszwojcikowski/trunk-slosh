import "./style.css";
import { Game } from "./game/Game";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div id="game-wrap">
    <canvas id="game" aria-label="Isometric view of the car and road"></canvas>

    <div class="hud">
      <section class="panel panel-cargo" aria-label="Cargo">
        <div class="panel-label">Cargo</div>
        <div class="cargo-row">
          <strong id="hud-liquid" class="big-num">100%</strong>
          <div class="tank"><span id="hud-liquid-bar" data-level="ok"></span></div>
        </div>
        <div class="slosh-row">
          <em>Slosh</em>
          <span class="slosh-meter"><span id="hud-slosh-bar" data-level="calm"></span></span>
          <b id="hud-slosh">calm</b>
        </div>
        <div class="seed-line"><em id="hud-seed">Seed</em> <em id="hud-ghost" hidden>Ghost</em></div>
      </section>
      <section class="panel panel-speed" aria-label="Speed">
        <div class="speed-row"><strong id="hud-speed" class="big-num">0</strong><span class="unit">km/h</span></div>
        <div class="stats">
          <span><em>G</em> <b id="hud-g">0.00</b></span>
          <span><em>Grade</em> <b id="hud-grade">level</b></span>
          <span><em>Air</em> <b id="hud-air">ground</b></span>
          <span><em>Route</em> <b id="hud-progress">0%</b></span>
          <span><em>CP</em> <b id="hud-checkpoint">0/3</b></span>
          <span><em>Time</em> <b id="hud-time">0:00.0</b></span>
        </div>
      </section>
    </div>

    <div id="tutorial-toast" class="tutorial-toast" hidden></div>

    <div class="corner-buttons">
      <button type="button" class="chip" id="btn-pause" title="Pause (P)">Pause</button>
      <button type="button" class="chip" data-action="restart" title="Restart (R)">Restart</button>
      <button type="button" class="chip" data-action="new-track" title="New track (N)">New track</button>
      <button type="button" class="chip" data-action="open-settings" title="Settings (,)">Settings</button>
      <button type="button" class="chip" id="btn-ink" title="Toggle ink shader (H)">Ink: on</button>
      <button type="button" class="chip" id="btn-trunk-iso" title="Toggle isometric tub view (I)">Tub 3D: on</button>
    </div>

    <div class="trunk-iso-panel" id="trunk-iso-panel" title="Click to enlarge tub view">
      <canvas id="trunk-iso" aria-label="Isometric view of sloshing liquid in the trunk tub"></canvas>
    </div>

    <div class="overlay trunk-iso-popout" id="trunk-iso-popout" hidden>
      <div class="card burst trunk-iso-popout-card">
        <button type="button" class="chip popout-close" data-action="close-trunk-popout">Close</button>
        <canvas id="trunk-iso-large" aria-label="Enlarged isometric tub view with flow arrows"></canvas>
      </div>
    </div>

    <div class="overlay" id="overlay-settings" hidden>
      <div class="card burst settings-card">
        <h2 class="title small">Settings</h2>
        <label class="set-row"><input type="checkbox" id="set-ink" /> Ink shader</label>
        <label class="set-row"><input type="checkbox" id="set-sfx" /> Sound effects</label>
        <label class="set-row"><input type="checkbox" id="set-motion" /> Reduced motion</label>
        <label class="set-row"><input type="checkbox" id="set-punch" /> Spill camera punch</label>
        <label class="set-row">Quality
          <select id="set-quality">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label class="set-row"><input type="checkbox" id="set-worker" /> Fluid worker (experimental)</label>
        <label class="set-row">Touch sensitivity <input type="range" id="set-touch" min="0.5" max="1.5" step="0.1" /></label>
        <label class="set-row">Pedal ramp <input type="range" id="set-ramp" min="0.5" max="2" step="0.1" /></label>
        <p class="achieve-label">Achievements</p>
        <ul class="achieve-list" id="achievement-list"></ul>
        <input type="file" id="goo-file" accept="application/json,.json" hidden />
        <div class="result-actions">
          <button type="button" class="btn btn-alt" data-action="export-replay">Export replay JSON</button>
          <button type="button" class="btn btn-alt" data-action="export-goo">Export goo JSON</button>
          <button type="button" class="btn btn-alt" data-action="import-goo">Import custom goo</button>
          <button type="button" class="btn btn-alt" data-action="clear-storage">Clear saved data</button>
          <button type="button" class="btn" data-action="close-settings">Close</button>
        </div>
      </div>
    </div>

    <div class="overlay" id="overlay-intro">
      <div class="card burst">
        <h1 class="title">Trunk <span>Slosh</span></h1>
        <p class="tagline">337 liters of toxic goo in an open tub. Get it across the badlands.</p>
        <p class="intro-seed" id="intro-seed"></p>
        <div class="run-pickers">
          <label>Mode <select id="select-mode"><option value="practice">Practice</option><option value="contract">Contract</option><option value="timetrial">Time trial</option></select></label>
          <label>Difficulty <select id="select-difficulty"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
          <label>Route <select id="select-archetype"><option value="auto">From seed</option><option value="flats">Flats</option><option value="canyon">Canyon</option><option value="boulder">Boulder field</option></select></label>
          <label>Cargo <select id="select-cargo"><option value="water">Water</option><option value="thick">Thick</option><option value="volatile">Volatile</option></select></label>
          <label>Vehicle <select id="select-vehicle"><option value="pickup">Pickup</option><option value="short">Short wheelbase</option></select></label>
        </div>
        <button type="button" class="chip daily-chip" data-action="daily-seed">Play today’s daily seed</button>
        <ul class="keys">
          <li><kbd>W</kbd><kbd>S</kbd> gas / brake · <kbd>P</kbd> pause · <kbd>,</kbd> settings</li>
          <li><kbd>A</kbd><kbd>D</kbd> steer · <kbd>Space</kbd> handbrake</li>
          <li><kbd>R</kbd> restart · <kbd>N</kbd> new track · <kbd>I</kbd> tub view</li>
        </ul>
        <p class="touch-hint">Left pad steers · right pad is gas and brake</p>
        <p class="cta">Hit the gas to roll</p>
      </div>
    </div>

    <div class="overlay" id="overlay-fail" hidden>
      <div class="card burst fail-card">
        <h2 class="title small">Run over</h2>
        <p class="tagline"></p>
        <div class="result-actions">
          <button type="button" class="btn" data-action="restart">Try again</button>
          <button type="button" class="btn btn-alt" data-action="new-track">New track</button>
        </div>
      </div>
    </div>

    <div class="overlay" id="overlay-result" hidden>
      <div class="card burst">
        <div class="grade" id="result-grade">S</div>
        <h2 class="title small">Delivered!</h2>
        <p class="result-seed" id="result-seed"></p>
        <div class="result-stats">
          <div><em>Kept</em><strong id="result-kept">100%</strong></div>
          <div><em>Time</em><strong id="result-time">0:00.0</strong></div>
        </div>
        <p class="tagline" id="result-quip"></p>
        <p class="result-detail" id="result-stats"></p>
        <p class="result-best" id="result-best"></p>
        <p class="result-achievements" id="result-achievements"></p>
        <div class="result-actions">
          <button type="button" class="btn" data-action="share-card">Share card</button>
          <button type="button" class="btn btn-alt" data-action="post-score">Copy score post</button>
          <button type="button" class="btn" data-action="restart">Run it again</button>
          <button type="button" class="btn btn-alt" data-action="new-track">New track</button>
        </div>
      </div>
    </div>

    <div class="touch-controls">
      <div class="touch-pad steer-pad" data-pad="steer" aria-label="Steer"><div class="knob"></div></div>
      <button type="button" class="touch-brake" data-pad="handbrake" aria-label="Handbrake">Drift</button>
      <div class="touch-pad drive-pad" data-pad="drive" aria-label="Gas and brake"><div class="knob"></div></div>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const isoCanvas = document.querySelector<HTMLCanvasElement>("#trunk-iso")!;
const isoLargeCanvas =
	document.querySelector<HTMLCanvasElement>("#trunk-iso-large")!;
const wrap = document.querySelector<HTMLDivElement>("#game-wrap")!;
new Game(canvas, isoCanvas, isoLargeCanvas, wrap);
