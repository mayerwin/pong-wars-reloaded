// A deliberately small DOM for the real game script. It parses the actual HTML
// controls and models capture -> target -> bubble using ONE event object. This
// tests handler order/deduplication, not browser layout or native key defaults;
// real browser QA covers rendering, autoplay, focus and audio output separately.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function loadWebsite({ storage = new Map(), native = false, touch = false, vibration = true, feedbackUnlockDelayMs = 0 } = {}) {
  let now = 0, timeoutId = 0;
  const timeouts = new Map(), elements = new Map(), musicInstances = [], feedbackInstances = [], vibrations = [], cues = [], feedbackCalls = [];
  let document, window;

  function dispatch(node, type, fields = {}) {
    const target = fields.target || node;
    const route = []; for (let el = target; el; el = el.parentNode) route.unshift(el);
    let stopped = false, immediate = false;
    const event = { type, target, bubbles: !['load', 'focus', 'blur', 'pagehide', 'pageshow'].includes(type),
      cancelable: true, defaultPrevented: false, eventPhase: 0, currentTarget: null, ...fields,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; },
      stopPropagation() { stopped = true; }, stopImmediatePropagation() { stopped = immediate = true; },
    };
    function invoke(el, capture, phase) {
      event.currentTarget = el; event.eventPhase = phase;
      for (const listener of [...(el._listeners.get(type) || [])]) {
        if (listener.capture !== capture) continue;
        listener.fn.call(el, event);
        if (listener.once) el.removeEventListener(type, listener.fn, capture);
        if (immediate) break;
      }
    }
    for (const el of route.slice(0, -1)) { invoke(el, true, 1); if (stopped) break; }
    if (!stopped) { invoke(target, true, 2); if (!immediate) invoke(target, false, 2); }
    if (event.bubbles && !stopped) for (const el of route.slice(0, -1).reverse()) { invoke(el, false, 3); if (stopped) break; }
    event.currentTarget = null; event.eventPhase = 0;
    return event;
  }

  function eventTarget() {
    return { _listeners: new Map(), parentNode: null,
      addEventListener(type, fn, options = false) {
        const capture = options === true || options.capture === true;
        const listeners = this._listeners.get(type) || [];
        if (!listeners.some(item => item.fn === fn && item.capture === capture)) listeners.push({ fn, capture, once: options.once === true });
        this._listeners.set(type, listeners);
      },
      removeEventListener(type, fn, options = false) {
        const capture = options === true || options.capture === true;
        this._listeners.set(type, (this._listeners.get(type) || []).filter(item => item.fn !== fn || item.capture !== capture));
      },
      emit(type, fields) { return dispatch(this, type, fields); },
    };
  }

  function simpleMatch(el, selector) {
    if (!el.tagName) return false;
    const tag = selector.match(/^[\w-]+/); if (tag && el.tagName !== tag[0].toUpperCase()) return false;
    for (const [, id] of selector.matchAll(/#([\w-]+)/g)) if (el.id !== id) return false;
    for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!el.classList.contains(name)) return false;
    for (const [, name, value] of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
      if (!el.hasAttribute(name) || (value !== undefined && el.getAttribute(name) !== value)) return false;
    }
    return true;
  }
  function matches(el, selector) {
    return selector.split(',').some(part => {
      const pieces = part.trim().split(/\s+/); if (!simpleMatch(el, pieces.pop())) return false;
      let ancestor = el.parentNode;
      while (pieces.length) {
        const part = pieces.pop(); while (ancestor && !simpleMatch(ancestor, part)) ancestor = ancestor.parentNode;
        if (!ancestor) return false; ancestor = ancestor.parentNode;
      }
      return true;
    });
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  function removeIds(node) { for (const el of [node, ...descendants(node)]) if (el.id && elements.get(el.id) === el) elements.delete(el.id); }

  function makeElement(tag) {
    const attributes = new Map(), classes = new Set();
    const el = { ...eventTarget(), tagName: tag.toUpperCase(), children: [], style: {}, dataset: {}, textContent: '', value: '', disabled: false,
      get id() { return attributes.get('id') || ''; }, set id(value) { this.setAttribute('id', value); },
      get className() { return [...classes].join(' '); }, set className(value) { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(item => classes.add(item)); },
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); }, remove(...names) { names.forEach(name => classes.delete(name)); },
        contains: name => classes.has(name), toggle(name, on = !classes.has(name)) { if (on) classes.add(name); else classes.delete(name); return on; },
      },
      setAttribute(name, value) {
        attributes.set(name, String(value));
        if (name === 'id') elements.set(String(value), this);
        if (name === 'class') this.className = value;
        if (name === 'value') this.value = String(value);
        if (name === 'type') this.type = String(value);
        if (name === 'disabled') this.disabled = true;
        if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      },
      getAttribute(name) { if (name === 'class') return this.className; return attributes.get(name) ?? null; },
      hasAttribute(name) { return attributes.has(name); },
      matches(selector) { return matches(this, selector); },
      closest(selector) { for (let node = this; node; node = node.parentNode) if (matches(node, selector)) return node; return null; },
      querySelectorAll(selector) { return descendants(this).filter(node => matches(node, selector)); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      append(...nodes) { nodes.forEach(node => this.appendChild(node)); },
      get innerHTML() { return ''; },
      set innerHTML(value) { this.children.forEach(removeIds); this.children = []; parseHTML(String(value), this); },
      click() { if (!this.disabled) return dispatch(this, 'click'); },
      focus() { if (!this.disabled) { document.activeElement = this; dispatch(this, 'focusin'); } },
      getContext: () => ({}), getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
      setPointerCapture() {}, releasePointerCapture() {},
    };
    return el;
  }
  function parseHTML(markup, parent) {
    const stack = [parent], voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
    for (const [, closing, tag, attrs, selfClosing] of markup.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*?)(\/?)>/gi)) {
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      const node = makeElement(tag);
      for (const [, key, double, single, bare] of attrs.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) node.setAttribute(key, double ?? single ?? bare ?? '');
      stack.at(-1).appendChild(node);
      if (!selfClosing && !voidTags.has(tag.toLowerCase())) stack.push(node);
    }
  }

  class Music {
    constructor() { this.active = false; this.enabled = true; this.background = false; this.volume = 0.7; this.unlocks = 0; musicInstances.push(this); }
    setEnabled(value) { this.enabled = value; } setVolume(value) { this.volume = value; } setActive(value) { this.active = value; }
    unlock() { this.unlocks++; } suspend() { this.background = true; } resume() { this.background = false; }
    dispose() { this.disposed = true; this.active = false; }
    get playing() { return this.active && this.enabled && this.volume > 0 && !this.background && !this.disposed; }
  }
  class Feedback {
    constructor(options = {}) { this.enabled = options.enabled !== false; this.volume = options.volume ?? 0.7; this.background = false; this.unlocks = 0; feedbackInstances.push(this); }
    setEnabled(value) { this.enabled = value; } setVolume(value) { this.volume = value; }
    unlock() { if (!this.unlocks) now += feedbackUnlockDelayMs; this.unlocks++; return Promise.resolve(true); }
    play(kind) { feedbackCalls.push(kind); if (!this.enabled || !this.volume || this.background) return Promise.resolve(false); cues.push(kind); return Promise.resolve(true); }
    suspend() { this.background = true; } resume() { this.background = false; } dispose() { this.background = true; }
  }
  window = { ...eventTarget(), matchMedia: () => ({ matches: !touch }), PongMenuMusic: Music, PongFeedback: Feedback };
  if (native) window.AndroidHost = {};
  document = { ...eventTarget(), children: [], hidden: false, activeElement: null,
    getElementById: id => elements.get(id) || null, createElement: makeElement,
    querySelectorAll: selector => descendants(document).filter(node => matches(node, selector)),
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
  };
  document.parentNode = window;
  parseHTML(html, document);
  document.documentElement = document.children.find(el => el.tagName === 'HTML');
  document.body = descendants(document).find(el => el.tagName === 'BODY'); document.activeElement = document.body;
  const navigator = { maxTouchPoints: touch ? 1 : 0 };
  if (vibration) navigator.vibrate = pattern => { vibrations.push(Array.isArray(pattern) ? Array.from(pattern) : pattern); return true; };
  const context = vm.createContext({ window, document, navigator, screen: {}, ResizeObserver: class { observe() {} disconnect() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    getComputedStyle: () => ({ getPropertyValue: () => '', transform: 'none' }), performance: { now: () => now },
    requestAnimationFrame() {}, setTimeout(fn, delay = 0) { const id = ++timeoutId; timeouts.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timeouts.delete(id); }, alert() {},
  });
  vm.runInContext(source, context, { filename: 'game.js' });
  const element = id => elements.get(id) || null;
  // Compatibility aliases used by the music tests; the real controls have no IDs.
  for (const group of ['snd-toggle', 'music-toggle', 'haptics-toggle']) {
    for (const value of ['on', 'off']) elements.set(group + '-' + value, element(group).querySelector(`[data-value="${value}"]`));
  }
  elements.set('reset-music', document.querySelectorAll('.reset-btn[data-key]').find(el => el.dataset.key === 'menuMusicEnabled'));
  return { api: window.PongGame, window, document, element, storage, musicInstances, feedbackInstances, vibrations, cues, feedbackCalls,
    run: expression => vm.runInContext(expression, context),
    get music() { return musicInstances.at(-1); }, get feedback() { return feedbackInstances.at(-1); },
    pointerClick(id, pointerType = 'mouse') {
      const node = typeof id === 'string' ? element(id) : id;
      node.emit('pointerdown', { pointerType }); node.focus(); node.emit('pointerup', { pointerType }); return node.click();
    },
    key(key, { target = document.activeElement, ...fields } = {}) { return dispatch(target, 'keydown', { key, ...fields }); },
    advance(ms) { now += ms; for (const [id, timer] of [...timeouts]) if (timer.at <= now) { timeouts.delete(id); timer.fn(); } },
  };
}
module.exports = { loadWebsite };
