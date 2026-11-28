/**
 * Ruian 连点器（auto clicker）
 *
 *   C          总开关（默认关，按一下开、再按一下关，刷新后记住）
 *   按住左键    以 43 CPS 补点
 *   按住右键    同上；左右独立，两个都按住就两个都点
 *   间隔抖动    ±30%：每一下的间隔都在 43 CPS 的基准上下随机浮动，不是死板的节拍器
 *
 * 只在真正进了游戏（指针锁在画布上、页面没被切走）时补点，所以开背包、聊天、按 Esc、
 * 切到别的窗口都不会误点。自己发出去的点击不会被当成"玩家按下的键"（只认 isTrusted），
 * 所以不会自己触发自己。
 *
 * 不去拦、不去吞真实的鼠标事件：手感和没装连点器时一样，只是按住的时候多出一串补点。
 * 游戏的输入在 Dom.java 里监听（canvas 的 mousedown / window 的 mouseup），会逐条处理
 * press 和 release，所以合成事件和真点击走的是同一条路。
 *
 * 计时：不是"点完再等 23ms"（那样在 Windows 上会被 15.6ms 的计时器精度取整成 31ms，
 * 只有 32 CPS），而是记下每一下"应该"在什么时候点，到点就点；计时器和下一帧各盯一遍，
 * 所以哪怕计时器被系统取整，平均频率也还是 43 CPS，抖动也还在。
 */
(() => {
  "use strict";

  /** 目标点击频率（每秒）。 */
  const CPS = 43;
  /** 间隔随机浮动幅度：±30%。 */
  const JITTER = 0.3;
  /** 开关按键（物理键位，不受输入法/键盘布局影响）。 */
  const TOGGLE_CODE = "KeyC";
  const STORAGE_KEY = "ruian.clicker.v5";
  /** 左键、右键（DOM 的 button 值；中键 1 不管）。 */
  const LEFT = 0;
  const RIGHT = 2;
  /** 43 CPS 的基准间隔，约 23.26 ms。 */
  const GAP = 1000 / CPS;
  /** 落后超过这么多毫秒就不再补点，重新对齐（标签页卡住过之后别一口气补一大串）。 */
  const RESYNC_MS = 50;

  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : null;
  const caf = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null;

  /** 画布是加载完之后才建的，所以每次都现找。 */
  function canvas() {
    return document.getElementById("incari-canvas") || document.querySelector("canvas");
  }

  /** 真的在游戏里：指针被锁住（进了游戏、没开界面），且页面没被切到后台。 */
  function live() {
    return document.pointerLockElement !== null && document.visibilityState === "visible";
  }

  const state = { on: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (typeof saved.on === "boolean") state.on = saved.on;
  } catch {
    /* 读不出来就用默认值 */
  }

  /** 真的按住没松的键（0 左、2 右）。 */
  const held = new Set();
  /** 每个键下一次该点的时间（performance.now() 的毫秒）。 */
  const dueAt = new Map();
  /** 等待中的计时器 / 下一帧，0 表示没排。 */
  let timer = 0;
  let frame = 0;

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 存不了不影响使用 */
    }
  }

  /** 下一次点击的间隔：43 CPS 的基准 ± 30%，每次都重新随机。 */
  function nextGap() {
    const spread = GAP * JITTER;
    return GAP + (Math.random() * 2 - 1) * spread;
  }

  /**
   * 补一次点击：按下再松开。两下都发给画布（游戏把 mousedown 挂在画布上，mouseup 挂在
   * window 上，画布上的事件会冒泡上去），所以和真点击走同一条路。
   *
   * 注意：这里不碰 preventDefault / stopPropagation，真实事件照常走，不会被我们干扰。
   */
  function fire(button) {
    const el = canvas();
    if (el === null) {
      return;
    }
    const shared = { bubbles: true, cancelable: true, composed: true, view: window, button, detail: 1 };
    el.dispatchEvent(new MouseEvent("mousedown", { ...shared, buttons: button === RIGHT ? 2 : 1 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...shared, buttons: 0 }));
  }

  /** 到点了：该点的点，该排的排。 */
  function flush() {
    if (timer !== 0) {
      clearTimeout(timer);
      timer = 0;
    }
    if (frame !== 0 && caf !== null) {
      caf(frame);
      frame = 0;
    }
    if (!state.on || !live()) {
      dueAt.clear();
      return;
    }
    const now = performance.now();
    for (const [button, due] of [...dueAt]) {
      if (!held.has(button)) {
        dueAt.delete(button);
        continue;
      }
      if (now < due) {
        continue;
      }
      fire(button);
      const next = due + nextGap();
      dueAt.set(button, now - next > RESYNC_MS ? now + nextGap() : next);
    }
    schedule();
  }

  /** 盯住最早的那一下：计时器管准头，下一帧兜底（计时器被系统取整时靠它跟上）。 */
  function schedule() {
    if (timer !== 0 || frame !== 0 || !state.on || !live() || dueAt.size === 0) {
      return;
    }
    let earliest = Infinity;
    for (const due of dueAt.values()) {
      earliest = Math.min(earliest, due);
    }
    timer = setTimeout(flush, Math.max(0, earliest - performance.now()));
    if (raf !== null) {
      frame = raf(flush);
    }
  }

  /** 开始给这个键补点（已经排上就不动）。 */
  function press(button) {
    if (!state.on || !live() || dueAt.has(button)) {
      return;
    }
    dueAt.set(button, performance.now() + nextGap());
    schedule();
  }

  function release(button) {
    dueAt.delete(button);
  }

  /**
   * 补一对"松开"。补点的最后一件事本来就是松开，正常不会留下按住的状态；这里只是保险，
   * 免得游戏万一还记着某个键按着，出现"挖不动方块 / 一直举盾"。
   */
  function releaseButtons() {
    const el = canvas();
    if (el === null) {
      return;
    }
    for (const button of [LEFT, RIGHT]) {
      el.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window, button, detail: 1, buttons: 0 }),
      );
    }
  }

  /** 停掉所有补点（不补松开）。 */
  function halt() {
    if (timer !== 0) {
      clearTimeout(timer);
      timer = 0;
    }
    if (frame !== 0 && caf !== null) {
      caf(frame);
      frame = 0;
    }
    dueAt.clear();
    held.clear();
  }

  /** 彻底停：补点、按住记录都清掉，再给游戏补一对松开。 */
  function stopAll() {
    const wasActive = dueAt.size > 0;
    halt();
    if (wasActive) {
      releaseButtons();
    }
  }

  function setOn(on) {
    state.on = on;
    if (on) {
      // 开的时候手正按着，就立刻接着点。
      for (const button of held) {
        press(button);
      }
    } else {
      stopAll();
    }
    save();
    paint();
  }

  // --- 真实按键（只认真实事件，合成的不算，避免自我循环） ---

  window.addEventListener(
    "mousedown",
    (event) => {
      if (!event.isTrusted || (event.button !== LEFT && event.button !== RIGHT)) {
        return;
      }
      held.add(event.button);
      press(event.button);
    },
    true,
  );

  window.addEventListener(
    "mouseup",
    (event) => {
      if (!event.isTrusted || (event.button !== LEFT && event.button !== RIGHT)) {
        return;
      }
      held.delete(event.button);
      release(event.button);
    },
    true,
  );

  // 丢了指针锁（开背包、Esc、点别处）或窗口失焦：立刻停，避免在界面上乱点。
  document.addEventListener("pointerlockchange", () => {
    if (!live()) {
      halt();
    }
  });
  window.addEventListener("blur", halt);

  // --- 开关 ---

  /** 在输入框里打字时，C 是字，不是开关。 */
  function typing(event) {
    const el = event.target;
    if (!el || !el.tagName) {
      return false;
    }
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
  }

  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || typing(event)) {
      return;
    }
    const isC = event.code === TOGGLE_CODE || (typeof event.key === "string" && event.key.toLowerCase() === "c");
    if (!isC) {
      return;
    }
    setOn(!state.on);
  });

  // --- 状态角标（只在开着的时候显示） ---

  const chip = document.createElement("div");
  chip.id = "ruian-clicker-chip";
  chip.hidden = true;
  chip.setAttribute("role", "status");
  chip.setAttribute("aria-live", "polite");
  document.body.appendChild(chip);

  function paint() {
    chip.textContent = `连点器 开 · ${CPS} CPS`;
    chip.hidden = !state.on;
  }

  paint();

  // 调试用：控制台里 ruianClicker 看当前状态，ruianClicker.on()/off() 手动开关。
  window.ruianClicker = {
    cps: CPS,
    jitter: JITTER,
    state,
    fire,
    live,
    on: () => setOn(true),
    off: () => setOn(false),
    toggle: () => setOn(!state.on),
  };
})();
