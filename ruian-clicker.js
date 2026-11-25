/**
 * Ruian 连点器（auto clicker）——按住才连点。
 *
 *   - C 键：总开关（开着才允许连点，默认关）；
 *   - 真的按住鼠标左键或右键时，才按 43 CPS 连续补点，松开立刻停；
 *   - 左右键独立：只按左就点左，只按右就点右，两个都按就两个都点；
 *   - 随机抖动 ±30%：每一下间隔在 ±30% 内浮动，不会像节拍器一样精准；
 *   - 只在指针锁定（真在游戏里）时生效，开背包/箱子/聊天/按 Esc 都不点；
 *   - 自己合成的点击不会被当成"真按键"，所以不会自我循环。
 *
 * 设置记在 localStorage，刷新后保留。游戏本体（wasm）一个字没动。
 */
(() => {
  const CPS = 43;
  const JITTER = 0.3;
  const TOGGLE_KEY = "c";
  const STORAGE = "ruian.clicker.v4";
  const LEFT = 0;
  const RIGHT = 2;

  /** 画布是加载完之后才建的，所以每次都现找。 */
  function canvas() {
    return document.getElementById("incari-canvas") || document.querySelector("canvas");
  }

  const state = { on: false };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    if (typeof saved.on === "boolean") state.on = saved.on;
  } catch {
    /* 用默认值 */
  }

  const timers = new Map(); // 按键 → 计时器
  const held = new Set(); // 真正按住的键

  function save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      /* 存不了不影响使用 */
    }
  }

  /**
   * 真的在游戏里：指针被锁住（说明进了游戏、没开界面），且页面没被切到后台。
   * 注意：游戏自己的 mousedown 监听器是挂在 #incari-canvas 上的，所以点击
   * 一律发给画布，发给别的元素会直接丢掉（那样连打人都不动了）。
   */
  function live() {
    return document.pointerLockElement !== null && document.visibilityState !== "hidden";
  }

  /** 下一次的间隔：43 CPS 的基准 ± 30% 抖动。 */
  function nextDelay() {
    const base = 1000 / CPS;
    const spread = base * JITTER;
    return Math.max(1, base + (Math.random() * 2 - 1) * spread);
  }

  /** 补一次点击：按下再松开，两下都交给游戏自己的监听器。 */
  function fire(button) {
    const el = canvas();
    if (el === null) {
      return;
    }
    const down = { bubbles: true, cancelable: true, view: window, button, detail: 1, buttons: button === RIGHT ? 2 : 1 };
    const up = { bubbles: true, cancelable: true, view: window, button, detail: 1, buttons: 0 };
    el.dispatchEvent(new MouseEvent("mousedown", down));
    el.dispatchEvent(new MouseEvent("mouseup", up));
  }

  function tick(button) {
    timers.delete(button);
    if (!held.has(button) || !state.on || !live()) {
      return;
    }
    fire(button);
    if (held.has(button) && state.on && live()) {
      timers.set(button, setTimeout(() => tick(button), nextDelay()));
    }
  }

  function start(button) {
    if (timers.has(button) || !state.on || !live()) {
      return;
    }
    timers.set(button, setTimeout(() => tick(button), nextDelay()));
  }

  function stop(button) {
    const t = timers.get(button);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(button);
    }
  }

  function releaseAll() {
    held.clear();
    for (const b of [...timers.keys()]) {
      stop(b);
    }
    clearButtons();
  }

  /**
   * 给游戏补一次"松开"：万一游戏内部还留着"左键按着"的状态（比如我们拦下了
   * 按下、游戏只收到一半，或者中途关了连点器），补两下松开把它清干净，
   * 免得出现"按住没反应、挖方块也挖不动"这种卡住的情况。
   */
  function clearButtons() {
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

  /**
   * 只认真的鼠标事件：自己合成的（isTrusted === false）不算按键，避免自我循环。
   *
   * 左键特殊处理：开着连点器、在游戏里按住左键时，把"真实的按住"拦下来，
   * 游戏只收到一串快速点按（按下后立刻松开）。游戏每次松开都会结束/重置
   * 挖方块的进度，所以按住左键只出攻击、挖不穿方块；想挖方块按 C 关掉即可。
   */
  function swallow(e) {
    if (!e.isTrusted || e.button !== LEFT || !state.on || !live()) {
      return false;
    }
    e.stopPropagation();
    // 游戏自己会在按下时把焦点给画布（Dom.java）。我们把事件拦了，就得替它做，
    // 否则画布拿不到焦点，整套输入（攻击、挖掘、走路）都会失灵。
    // 也不要 preventDefault：那会连带掐掉浏览器的聚焦行为。
    const el = canvas();
    if (el !== null && typeof el.focus === "function") {
      el.focus({ preventScroll: true });
    }
    return true;
  }

  window.addEventListener(
    "mousedown",
    (e) => {
      if (!e.isTrusted || e.button === 1) {
        return;
      }
      swallow(e);
      held.add(e.button);
      start(e.button);
    },
    true,
  );
  window.addEventListener(
    "mouseup",
    (e) => {
      if (!e.isTrusted) {
        return;
      }
      swallow(e);
      held.delete(e.button);
      stop(e.button);
    },
    true,
  );

  // 双保险：万一游戏把监听器挂在了捕获阶段，再在画布自身用捕获抢先一步，
  // 直接 stopImmediatePropagation（同一个节点上的后续监听器也不再执行）。
  function guard(el) {
    if (el === null || el === undefined || el.__ruianGuarded) {
      return;
    }
    el.__ruianGuarded = true;
    const block = (e) => {
      if (!swallow(e)) {
        return;
      }
      e.stopImmediatePropagation();
      if (e.type === "mousedown") {
        held.add(e.button);
        start(e.button);
      } else {
        held.delete(e.button);
        stop(e.button);
      }
    };
    el.addEventListener("mousedown", block, true);
    el.addEventListener("mouseup", block, true);
  }

  guard(canvas());
  document.addEventListener("pointerlockchange", () => {
    guard(document.pointerLockElement);
    if (!live()) {
      releaseAll();
    }
  });
  window.addEventListener("blur", releaseAll);

  // 状态角标（只在开着的时候显示）
  const chip = document.createElement("div");
  chip.id = "ruian-clicker-chip";
  chip.hidden = true;
  document.body.appendChild(chip);

  function paint() {
    if (state.on) {
      chip.textContent = "连点器开";
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
  }

  function typingIn(e) {
    const el = e.target;
    if (!el || !el.tagName) {
      return false;
    }
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable === true;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || typingIn(e)) {
      return;
    }
    if (e.key.toLowerCase() !== TOGGLE_KEY) {
      return;
    }
    state.on = !state.on;
    if (!state.on) {
      releaseAll();
    }
    save();
    paint();
  });

  paint();

  // 调试用：控制台里 ruianClicker.state 看当前状态
  window.ruianClicker = {
    state,
    fire,
    live,
    cps: CPS,
    jitter: JITTER,
    press: (button) => {
      held.add(button);
      start(button);
    },
    release: (button) => {
      held.delete(button);
      stop(button);
    },
  };
})();
