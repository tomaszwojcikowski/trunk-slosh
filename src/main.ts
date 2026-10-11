import './style.css'
import { Game } from './game/Game'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div id="game-wrap">
    <canvas id="game" aria-label="Top-down view of the car and road"></canvas>

    <div class="hud">
      <section class="panel panel-cargo" aria-label="Cargo">
        <div class="panel-label">Cargo</div>
        <div class="cargo-row">
          <strong id="hud-liquid" class="big-num">100%</strong>
          <div class="tank"><span id="hud-liquid-bar" data-level="ok"></span></div>
        </div>
      </section>
      <section class="panel panel-speed" aria-label="Speed">
        <div class="speed-row"><strong id="hud-speed" class="big-num">0</strong><span class="unit">km/h</span></div>
        <div class="stats">
          <span><em>G</em> <b id="hud-g">0.00</b></span>
          <span><em>Route</em> <b id="hud-progress">0%</b></span>
          <span><em>Time</em> <b id="hud-time">0:00.0</b></span>
        </div>
      </section>
    </div>

    <div class="corner-buttons">
      <button type="button" class="chip" data-action="restart" title="Restart (R)">Restart</button>
      <button type="button" class="chip" data-action="new-track" title="New track (N)">New track</button>
      <button type="button" class="chip" id="btn-ink" title="Toggle ink shader (H)">Ink: on</button>
    </div>

    <div class="overlay" id="overlay-intro">
      <div class="card burst">
        <h1 class="title">Trunk <span>Slosh</span></h1>
        <p class="tagline">337 liters of toxic goo in an open tub. Get it across the badlands.</p>
        <ul class="keys">
          <li><kbd>W</kbd><kbd>S</kbd> gas / brake</li>
          <li><kbd>A</kbd><kbd>D</kbd> steer</li>
          <li><kbd>Space</kbd> handbrake</li>
          <li><kbd>R</kbd> restart · <kbd>N</kbd> new track</li>
        </ul>
        <p class="touch-hint">Left pad steers · right pad is gas and brake</p>
        <p class="cta">Hit the gas to roll</p>
      </div>
    </div>

    <div class="overlay" id="overlay-result" hidden>
      <div class="card burst">
        <div class="grade" id="result-grade">S</div>
        <h2 class="title small">Delivered!</h2>
        <div class="result-stats">
          <div><em>Kept</em><strong id="result-kept">100%</strong></div>
          <div><em>Time</em><strong id="result-time">0:00.0</strong></div>
        </div>
        <p class="tagline" id="result-quip"></p>
        <div class="result-actions">
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
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')!
const wrap = document.querySelector<HTMLDivElement>('#game-wrap')!
new Game(canvas, wrap)
