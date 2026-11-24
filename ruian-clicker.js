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

  /** 真的在游戏里：指针锁在游戏画布上，且页面没被切到后台。 */
  function live() {
    const el = document.pointerLockElement;
    return el !== null && el === canvas() && document.visibilityState !== "hidden";
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
  }

  // 只认真的鼠标事件：自己合成的（isTrusted === false）不算按键，避免自我循环。
  window.addEventListener(
    "mousedown",
    (e) => {
      if (!e.isTrusted || e.button === 1) {
        return;
      }
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
      held.delete(e.button);
      stop(e.button);
    },
    true,
  );
  document.addEventListener("pointerlockchange", () => {
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

  let toastTimer = null;
  const toast = document.createElement("div");
  toast.id = "ruian-clicker-toast";
  toast.hidden = true;
  document.body.appendChild(toast);

  function say(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }

  function paint() {
    if (state.on) {
      chip.textContent = `连点器 ${CPS} CPS · 按住左/右键 · C 关`;
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
    say(state.on ? `连点器已开 · 按住鼠标即连点 ${CPS} CPS` : "连点器已关");
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
