/**
 * @file p5sprite.js
 * @author MGB
 * @version beta
 *
 * Lightweight Scratch-style helper layer for p5.js (instance mode) plus a
 * tiny UI toolkit.  Exposes:
 *   • createSprite     • createTextBox   • createInputBox
 *   • createSound      • setBackground   • drawText
 *   • forever / stop   • pen             • key (arrow + space)
 *
 * MIT License © 2025 MGB
 */

/* eslint-disable no-unused-vars */
(() => {
  /* ──────────────────────────────────────────────
     Global shared state
     ────────────────────────────────────────────── */
  /** @type {Sprite[]}  */ const sprites    = [];
  /** @type {TextBox[]} */ const textBoxes  = [];
  /** @type {InputBox[]}*/ const inputBoxes = [];

  let backdropImage = null;            // p5.Image or null
  let bgColor       = null;            // colour value or null
  /** @type {(Function|null)} */ let gameLoop = null;
  /** @type {p5} */ let sketchInstance = null;

  const keyState = { left:false, right:false, up:false, down:false, space:false };

  /* ──────────────────────────────────────────────
     Sprite class
     ────────────────────────────────────────────── */
  class Sprite {
    /**
     * @param {string[]} imgPaths One or more costume URLs
     */
    constructor(imgPaths) {
      this.x = 0;
      this.y = 0;
      this.direction = 90;
      this.rotationStyle = 'free';   // 'free' | 'flipped'
      this.costumeId = 0;
      this.hidden = false;
      this.layer = 0;
      this.images = imgPaths.map(p => sketchInstance.loadImage(p));
      this.hitRadius = 40;
      this.scale = 1;
      this.w = null;
      this.h = null;
    }

    moveTo(x, y) { this.x = x; this.y = y; }

    /**
     * Move along current heading.
     * @param {number} pixels
     */
    stepForward(pixels) {
      const r = sketchInstance.radians(this.direction);
      this.x += Math.cos(r) * pixels;
      this.y += Math.sin(r) * pixels;
    }

    setScale(s) { this.scale = s; }

    /**
     * Explicit draw size (px).
     * @param {number} w
     * @param {number} h
     */
    setSize(w, h) { this.w = w; this.h = h; }

    /**
     * Circle-circle collision.
     * @param {Sprite} other
     * @returns {boolean}
     */
    touched(other) {
      return sketchInstance.dist(this.x, this.y, other.x, other.y) <
             (this.hitRadius + other.hitRadius);
    }

    /** @private */
    _draw() {
      if (this.hidden) return;
      const img = this.images[this.costumeId % this.images.length];
      if (!img) return;

      sketchInstance.push();
      sketchInstance.translate(this.x, this.y);

      if (this.rotationStyle === 'free') {
        sketchInstance.rotate(sketchInstance.radians(this.direction));
      } else if (this.rotationStyle === 'flipped') {
        const d = ((this.direction % 360) + 360) % 360;
        if (d > 90 && d < 270) sketchInstance.scale(-1, 1);
      }

      sketchInstance.imageMode(sketchInstance.CENTER);
      const dw = this.w ?? img.width  * this.scale;
      const dh = this.h ?? img.height * this.scale;
      sketchInstance.image(img, 0, 0, dw, dh);
      sketchInstance.pop();
    }
  }

  /* ──────────────────────────────────────────────
     TextBox class
     ────────────────────────────────────────────── */
  class TextBox {
    constructor(x, y, txt, color='#fff', size=24, font='sans-serif') {
      this.x = x; this.y = y;
      this.text = txt;
      this.color = color;
      this.size = size;
      this.font = font;
      this.hidden = false;
      this.layer = 0;
    }
    setText(t) { this.text = t; }
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
     InputBox class  (patched with safe DOM + canvas checks)
     ────────────────────────────────────────────── */
  class InputBox {
    constructor(x, y, w, h, placeholder='', layer=0) {
      this.layer = layer;

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

      /* safe mount: body may not exist yet */
      const mount = () =>
        (document.body || document.documentElement).appendChild(this.el);
      if (document.body) mount();
      else window.addEventListener('DOMContentLoaded', mount, { once:true });

      this._cx = x; this._cy = y; this._w = w; this._h = h;
      _recalc(this);                     // initial attempt

      window.addEventListener('unload', () => this.el.remove());
    }

    get value() { return this.el.value; }
    set value(v) { this.el.value = v; }

    get hidden() { return this.el.style.display === 'none'; }
    set hidden(f){ this.el.style.display = f ? 'none' : 'block'; }

    moveTo(x, y) { this._cx = x; this._cy = y; _recalc(this); }
    resize(w, h) { this._w = w; this._h = h; _recalc(this); }
    focus()      { this.el.focus(); }

    /** @private */
    _sync() { _recalc(this); }
  }

  /**
   * Align InputBox DOM element to the canvas (safe if canvas not ready yet).
   * @private
   * @param {InputBox} ib
   */
  function _recalc(ib) {
    if (!sketchInstance || !sketchInstance.canvas) return;   // canvas not yet built
    const rect = sketchInstance.canvas.getBoundingClientRect();
    ib.el.style.left   = `${rect.left + ib._cx - ib._w / 2}px`;
    ib.el.style.top    = `${rect.top  + ib._cy - ib._h / 2}px`;
    ib.el.style.width  = `${ib._w}px`;
    ib.el.style.height = `${ib._h}px`;
  }

  /* ──────────────────────────────────────────────
     Pen helper (immediate mode)
     ────────────────────────────────────────────── */
  const pen = {
    color:'#000', fillColor:'#000',
    drawLine(x1,y1,x2,y2){
      sketchInstance.push();
      sketchInstance.stroke(this.color);
      sketchInstance.line(x1,y1,x2,y2);
      sketchInstance.pop();
    },
    drawRect(x,y,w,h){
      sketchInstance.push();
      sketchInstance.noStroke();
      sketchInstance.fill(this.fillColor);
      sketchInstance.rect(x,y,w,h);
      sketchInstance.pop();
    }
  };

  /* ──────────────────────────────────────────────
     Utility functions
     ────────────────────────────────────────────── */
  function drawText(txt,x,y,color='#fff',size=24){
    sketchInstance.push();
    sketchInstance.fill(color);
    sketchInstance.noStroke();
    sketchInstance.textSize(size);
    sketchInstance.textAlign(sketchInstance.LEFT, sketchInstance.TOP);
    sketchInstance.text(txt,x,y);
    sketchInstance.pop();
  }

  function setBackground(val){
    if(typeof val==='string'&&/\.(png|jpe?g|gif|bmp|webp)$/i.test(val)){
      backdropImage = sketchInstance.loadImage(val);
      bgColor = null;
    }else{
      bgColor = val;
      backdropImage = null;
    }
  }

  function createSprite(/* [x,y,] paths… */){
    let x=0,y=0,imgPaths=[...arguments];
    if(typeof arguments[0]==='number'&&typeof arguments[1]==='number'){
      x=arguments[0]; y=arguments[1];
      imgPaths=imgPaths.slice(2);
    }
    const s = new Sprite(imgPaths);
    s.moveTo(x,y);
    sprites.push(s);
    return s;
  }

  function createTextBox(x,y,txt,color='#fff',size=24,font='sans-serif'){
    const tb = new TextBox(x,y,txt,color,size,font);
    textBoxes.push(tb);
    return tb;
  }

  function createInputBox(x,y,w=200,h=28,placeholder='',layer=0){
    const ib = new InputBox(x,y,w,h,placeholder,layer);
    inputBoxes.push(ib);
    return ib;
  }

  function createSound(path,loop=false){
    const snd = sketchInstance.loadSound(path,()=>{ if(loop) snd.loop(); });
    return snd;
  }

  function forever(fn){ gameLoop = fn; }
  function stop(){ if(sketchInstance) sketchInstance.noLoop(); }

  /* ──────────────────────────────────────────────
     Keyboard helper
     ────────────────────────────────────────────── */
  function _upd(code,on){
    switch(code){
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
  sketchInstance = new window.p5(sk=>{
    sk.setup = ()=>{
      sk.createCanvas(1200,900);
      sk.frameRate(60);
      sk.imageMode(sk.CENTER);
      sk.textFont('sans-serif');
    };
    sk.draw = ()=>{
      sk.clear();
      if(backdropImage) sk.image(backdropImage,sk.width/2,sk.height/2,sk.width,sk.height);
      else if(bgColor!=null) sk.background(bgColor);
      else sk.background(30);

      if(gameLoop) gameLoop();

      sprites.slice().sort((a,b)=>a.layer-b.layer).forEach(s=>s._draw());
      textBoxes.slice().sort((a,b)=>a.layer-b.layer).forEach(t=>t._draw());
      inputBoxes.slice().sort((a,b)=>a.layer-b.layer).forEach(i=>i._sync());
    };
    sk.keyPressed  = ()=>_upd(sk.keyCode,true);
    sk.keyReleased = ()=>_upd(sk.keyCode,false);
  });

  /* ──────────────────────────────────────────────
     Public API (attached to window)
     ────────────────────────────────────────────── */
  window.setBackground  = setBackground;
  window.createSprite   = createSprite;
  window.createTextBox  = createTextBox;
  window.createInputBox = createInputBox;
  window.createSound    = createSound;
  window.drawText       = drawText;
  window.forever        = forever;
  window.stop           = stop;
  window.pen            = pen;
  window.key            = keyState;
})();
