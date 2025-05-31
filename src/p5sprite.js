/**
 * @file p5sprite.js
 * @author MGB
 * @version beta
 *
 * @description Scratch-style helper layer for p5.js (instance mode) + micro UI toolkit.
 * Exposes:
 *   • createSprite     • createTextBox   • createInputBox
 *   • createSound      • setBackground   • drawText
 *   • forever / stop   • pen             • key (arrow + space)
 *
 * MIT License © 2025 MGB
 */

let canvaX = 1280;
let canvaY = 720;


/* eslint-disable no-unused-vars */
(() => {
  /* ──────────────────────────────────────────────
     Global shared state
     ────────────────────────────────────────────── */
  /** @type {Sprite[]}  List of active sprite instances. */
  const sprites = [];
  /** @type {TextBox[]} List of persistent on-canvas labels. */
  const textBoxes = [];
  /** @type {InputBox[]} List of DOM-based input boxes. */
  const inputBoxes = [];

  /** @type {p5.Image|null} Current backdrop image (full-screen). */
  let backdropImage = null;
  /** @type {number|string|p5.Color|null} Current solid background colour. */
  let bgColor = null;
  /** @type {(Function|null)} User-supplied per-frame callback. */
  let gameLoop = null;
  /** @type {p5} Reference to the single p5 instance. */
  let sketchInstance = null;

  /** Live arrow / space key state (read-only for users). */
  const keyState = { left: false, right: false, up: false, down: false, space: false };

  /* ──────────────────────────────────────────────
     Sprite class
     ────────────────────────────────────────────── */
  /**
   * Lightweight 2-D sprite with multiple costumes.
   * @class
   */
  class Sprite {
    /**
     * @param {string[]} imgPaths One or more costume URLs (loaded via p5.loadImage)
     */
    constructor(imgPaths) {
      /** @member {number} Centre x (px) */
      this.x = 0;
      /** @member {number} Centre y (px) */
      this.y = 0;
      /** @member {number} Heading in degrees (0 = right, 90 = down). */
      this.direction = 90;
      /** @member {'free'|'flipped'} Rotation style. */
      this.rotationStyle = 'free';
      /** @member {number} Current costume index. */
      this.costumeId = 0;
      /** @member {boolean} Visibility flag. */
      this.hidden = false;
      /** @member {number} Draw-order layer (lower renders first). */
      this.layer = 0;
      /** @member {p5.Image[]} Loaded costumes. */
      this.images = imgPaths.map(p => sketchInstance.loadImage(p));
      /** @member {number} Collision circle radius (px). */
      this.hitRadius = 40;
      /** @member {number} Uniform scale (1 = natural). */
      this.scale = 1;
      /** @member {?number} Explicit width (px); null = auto. */
      this.w = null;
      /** @member {?number} Explicit height (px); null = auto. */
      this.h = null;
    }

    /**
     * Teleport sprite instantly.
     * @param {number} x New centre x (px)
     * @param {number} y New centre y (px)
     */
    moveTo(x, y) { this.x = x; this.y = y; }

    /**
     * Step forward along current heading.
     * @param {number} pixels Distance to move (px)
     */
    stepForward(pixels) {
      const r = sketchInstance.radians(this.direction);
      this.x += Math.cos(r) * pixels;
      this.y += Math.sin(r) * pixels;
    }

    /**
     * Uniformly scale sprite (affects draw size only).
     * @param {number} s Scale factor (1 = natural)
     */
    setScale(s) { this.scale = s; }

    /**
     * Set explicit draw size (bypasses {@link Sprite#setScale}).
     * @param {number} w Width (px)
     * @param {number} h Height (px)
     */
    setSize(w, h) { this.w = w; this.h = h; }

    /**
     * Simple circle-circle collision test.
     * @param {Sprite} other Other sprite to test
     * @returns {boolean} **true** if hit-circles overlap
     */
    touched(other) {
      return sketchInstance.dist(this.x, this.y, other.x, other.y) <
        (this.hitRadius + other.hitRadius);
    }

    /** @private Internal renderer (called by engine). */
    _draw() {
      if (this.hidden) return;
      const img = this.images[this.costumeId % this.images.length];
      if (!img) return;

      sketchInstance.push();
      sketchInstance.translate(this.x, this.y);

      // rotate or flip
      if (this.rotationStyle === 'free') {
        sketchInstance.rotate(sketchInstance.radians(this.direction));
      } else if (this.rotationStyle === 'flipped') {
        const d = ((this.direction % 360) + 360) % 360;
        if (d > 90 && d < 270) sketchInstance.scale(-1, 1);
      }

      sketchInstance.imageMode(sketchInstance.CENTER);
      const dw = this.w ?? img.width * this.scale;
      const dh = this.h ?? img.height * this.scale;
      sketchInstance.image(img, 0, 0, dw, dh);
      sketchInstance.pop();
    }
  }

  /* ──────────────────────────────────────────────
     TextBox class
     ────────────────────────────────────────────── */
  /**
   * Persistent on-canvas label (non-interactive).
   * @class
   */
  class TextBox {
    /**
     * @param {number} x Centre x (px)
     * @param {number} y Centre y (px)
     * @param {string} txt Initial text
     * @param {string|p5.Color} [color='#fff'] Fill colour
     * @param {number} [size=24] Font size (px)
     * @param {string} [font='sans-serif'] Font family
     */
    constructor(x, y, txt, color = '#fff', size = 24, font = 'sans-serif') {
      this.x = x; this.y = y;
      this.text = txt;
      this.color = color;
      this.size = size;
      this.font = font;
      this.hidden = false;
      this.layer = 0;
    }

    /** @param {string} t New text */
    setText(t) { this.text = t; }
    /** @param {number} x
        @param {number} y */
    moveTo(x, y) { this.x = x; this.y = y; }

    /** @private */
    _draw() {
      if (this.hidden) return;
      sketchInstance.push();
      sketchInstance.fill(this.color);
      sketchInstance.noStroke();
      sketchInstance.textSize(this.size);
      sketchInstance.textFont(this.font);
      sketchInstance.textAlign(sketchInstance.CENTER, sketchInstance.CENTER);
      sketchInstance.text(this.text, this.x, this.y);
      sketchInstance.pop();
    }
  }

  /* ──────────────────────────────────────────────
     InputBox class  (DOM <input>)
     ────────────────────────────────────────────── */
  /**
   * Unicode-capable `<input type="text">` aligned to the canvas.
   * @class
   */
  class InputBox {
    /**
     * @param {number} x         Centre x (canvas px)
     * @param {number} y         Centre y (canvas px)
     * @param {number} w         Width (px)
     * @param {number} h         Height (px)
     * @param {string} placeholder Optional placeholder string
     * @param {number} [layer=0] Draw-order layer
     */
    constructor(x, y, w, h, placeholder = '', layer = 0) {
      /** @member {number} Layer for sort order */
      this.layer = layer;

      /** @member {HTMLInputElement} Native DOM element */
      this.el = document.createElement('input');
      this.el.type = 'text';
      this.el.placeholder = placeholder;
      this.el.spellcheck = false;
      this.el.autocomplete = 'off';
      this.el.style.position = 'absolute';
      this.el.style.padding = '4px 6px';
      this.el.style.font = '16px sans-serif';
      this.el.style.boxSizing = 'border-box';
      this.el.style.border = '1px solid #888';
      this.el.style.borderRadius = '4px';
      this.el.style.background = '#fff';
      this.el.style.color = '#000';
      this.el.style.zIndex = '10';

      /* safe mount: wait for <body> if needed */
      const mount = () =>
        (document.body || document.documentElement).appendChild(this.el);
      if (document.body) mount();
      else window.addEventListener('DOMContentLoaded', mount, { once: true });

      // logical placement
      this._cx = x; this._cy = y; this._w = w; this._h = h;
      _recalc(this);    // initial attempt

      window.addEventListener('unload', () => this.el.remove());
    }

    /** Current string value. */
    get value() { return this.el.value; }
    set value(v) { this.el.value = v; }

    /** Hide / show box. */
    get hidden() { return this.el.style.display === 'none'; }
    set hidden(f) { this.el.style.display = f ? 'none' : 'block'; }

    /**
     * Move centre coordinate.
     * @param {number} x
     * @param {number} y
     */
    moveTo(x, y) { this._cx = x; this._cy = y; _recalc(this); }

    /**
     * Resize box.
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) { this._w = w; this._h = h; _recalc(this); }

    /** Focus keyboard cursor. */
    focus() { this.el.focus(); }

    /** @private Sync DOM element each frame. */
    _sync() { _recalc(this); }
  }

  /**
   * Align InputBox DOM element to the p5 canvas.
   * Skips if canvas not yet ready (first frame will catch up).
   * @private
   * @param {InputBox} ib
   */
  function _recalc(ib) {
    if (!sketchInstance || !sketchInstance.canvas) return;
    const rect = sketchInstance.canvas.getBoundingClientRect();
    ib.el.style.left = `${rect.left + ib._cx - ib._w / 2}px`;
    ib.el.style.top = `${rect.top + ib._cy - ib._h / 2}px`;
    ib.el.style.width = `${ib._w}px`;
    ib.el.style.height = `${ib._h}px`;
  }

  /* ──────────────────────────────────────────────
     pen – immediate drawing helper
     ────────────────────────────────────────────── */
  /**
   * Immediate-mode drawing helper.
   * @namespace pen
   */
  const pen = {
    /** Stroke colour. */ color: '#000',
    /** Fill colour.   */ fillColor: '#000',

    /**
     * Draw a straight line.
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     */
    drawLine(x1, y1, x2, y2) {
      sketchInstance.push();
      sketchInstance.stroke(this.color);
      sketchInstance.line(x1, y1, x2, y2);
      sketchInstance.pop();
    },

    /**
     * Draw a filled rectangle.
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     */
    drawRect(x, y, w, h) {
      sketchInstance.push();
      sketchInstance.noStroke();
      sketchInstance.fill(this.fillColor);
      sketchInstance.rect(x, y, w, h);
      sketchInstance.pop();
    }
  };

  /* ──────────────────────────────────────────────
     Public utility functions
     ────────────────────────────────────────────── */

  /**
   * Draw transient HUD text (does **not** persist across frames).
   * @param {string} txt
   * @param {number} x
   * @param {number} y
   * @param {string|p5.Color} [color='#fff']
   * @param {number} [size=24]
   */
  function drawText(txt, x, y, color = '#fff', size = 24) {
    sketchInstance.push();
    sketchInstance.fill(color);
    sketchInstance.noStroke();
    sketchInstance.textSize(size);
    sketchInstance.textAlign(sketchInstance.LEFT, sketchInstance.TOP);
    sketchInstance.text(txt, x, y);
    sketchInstance.pop();
  }

  /**
   * Set solid colour or backdrop image.
   * @param {string|number|p5.Color} val Colour value **or** image URL.
   */
  function setBackground(val) {
    if (typeof val === 'string' && /\.(png|jpe?g|gif|bmp|webp)$/i.test(val)) {
      backdropImage = sketchInstance.loadImage(val);
      bgColor = null;
    } else {
      bgColor = val;
      backdropImage = null;
    }
  }

  /**
   * Create a new {@link Sprite}.
   *
   * Call styles:
   * ```js
   * createSprite(x, y, 'a.png', 'b.png'); // explicit position
   * createSprite('a.png', 'b.png');       // defaults to (0,0)
   * ```
   * @returns {Sprite}
   */
  function createSprite(/* [x,y,] paths… */) {
    let x = 0, y = 0, imgPaths = [...arguments];
    if (typeof arguments[0] === 'number' && typeof arguments[1] === 'number') {
      x = arguments[0]; y = arguments[1];
      imgPaths = imgPaths.slice(2);
    }
    const s = new Sprite(imgPaths);
    s.moveTo(x, y);
    sprites.push(s);
    return s;
  }

  /**
   * Create a persistent on-canvas label.
   * @returns {TextBox}
   */
  function createTextBox(x, y, txt, color = '#fff', size = 24, font = 'sans-serif') {
    const tb = new TextBox(x, y, txt, color, size, font);
    textBoxes.push(tb);
    return tb;
  }

  /**
   * Create a Unicode-capable input box tied to the canvas.
   * @returns {InputBox}
   */
  function createInputBox(x, y, w = 200, h = 28, placeholder = '', layer = 0) {
    const ib = new InputBox(x, y, w, h, placeholder, layer);
    inputBoxes.push(ib);
    return ib;
  }

  /**
   * Load a sound file (requires p5.sound). Loops automatically if requested.
   * @param {string} path
   * @param {boolean} [loop=false]
   * @returns {p5.SoundFile}
   */
  function createSound(path, loop = false) {
    const snd = sketchInstance.loadSound(path, () => { if (loop) snd.loop(); });
    return snd;
  }

  /**
   * Register a per-frame callback (Scratch-style “forever” loop).
   * @param {Function} fn Callback executed each draw()
   */
  function forever(fn) { gameLoop = fn; }

  /** Stop the p5 draw loop entirely. */
  function stop() { if (sketchInstance) sketchInstance.noLoop(); }

  /* ──────────────────────────────────────────────
     Keyboard helper (internal)
     ────────────────────────────────────────────── */
  /** @private */
  function _upd(code, on) {
    switch (code) {
      case sketchInstance.LEFT_ARROW:  keyState.left  = on; break;
      case sketchInstance.RIGHT_ARROW: keyState.right = on; break;
      case sketchInstance.UP_ARROW:    keyState.up    = on; break;
      case sketchInstance.DOWN_ARROW:  keyState.down  = on; break;
      case 32:                         keyState.space = on; break;
    }
  }

  /* ──────────────────────────────────────────────
     p5 instance bootstrap
     ────────────────────────────────────────────── */
  sketchInstance = new window.p5(sk => {
    sk.setup = () => {
      sk.createCanvas(canvaX, canvaY).position((sk.windowWidth - canvaX) / 2, (sk.windowHeight - canvaY) / 2).style('z-index', '0'); // lower than input box
      sk.frameRate(60);
      sk.imageMode(sk.CENTER);
      sk.textFont('sans-serif');
    };

    sk.draw = () => {
      sk.clear();
      if (backdropImage) sk.image(backdropImage, sk.width / 2, sk.height / 2, sk.width, sk.height);
      else if (bgColor != null) sk.background(bgColor); else sk.background(30);

      if (gameLoop) gameLoop();

      sprites   .slice().sort((a, b) => a.layer - b.layer).forEach(s => s._draw());
      textBoxes .slice().sort((a, b) => a.layer - b.layer).forEach(t => t._draw());
      inputBoxes.slice().sort((a, b) => a.layer - b.layer).forEach(i => i._sync());
    };

    sk.keyPressed  = () => _upd(sk.keyCode, true);
    sk.keyReleased = () => _upd(sk.keyCode, false);
  });

  /* ──────────────────────────────────────────────
     Public API (attached to window)
     ────────────────────────────────────────────── */
  /** Solid colour or image backdrop. */ window.setBackground = setBackground;
  /** Sprite factory. */               window.createSprite   = createSprite;
  /** Label factory. */                window.createTextBox  = createTextBox;
  /** Input factory. */                window.createInputBox = createInputBox;
  /** Sound loader. */                 window.createSound    = createSound;
  /** Immediate text. */               window.drawText       = drawText;
  /** Register forever loop. */        window.forever        = forever;
  /** Halt draw loop. */               window.stop           = stop;
  /** Pen helper object. */            window.pen            = pen;
  /** Arrow/space key state. */        window.key            = keyState;
})();
