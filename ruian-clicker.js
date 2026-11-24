/**
 * Ruian 连点器（auto clicker）：按住鼠标左键时，按设定的 CPS 补发点击。
 *
 * 只在指针已经锁定（也就是真的在游戏里、没开背包/聊天/菜单）时生效，
 * 所以在 GUI 里不会乱点格子。它不改游戏本体：把 mousedown/mouseup 事件
 * 合成到画布上，游戏那边的监听器收到的和自己点的没有区别。
 *
 *   F7  开 / 关
 *   F8  换档：2 / 4 / 6 / 8 / 10 / 12 / 16 / 20 CPS
 *
 * 设置记在 localStorage，刷新后保留。
 */
(() => {
  const RATES = [2, 4, 6, 8, 10, 12, 16, 20];
  const DEFAULT_RATE = 10;
  const STORAGE = "ruian.clicker.v1";

  const canvas = document.getElementById("incari-canvas");
  if (canvas === null) {
    return;
  }

  const state = { on: false, rate: DEFAULT_RATE };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    if (typeof saved.on === "boolean") state.on = saved.on;
    if (RATES.includes(saved.rate)) state.rate = saved.rate;
  } catch {
    /* 记不住就算了，用默认值 */
  }

  let held = false;
  let timer = null;

  function save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(state));
    } catch {
      /* 存不了不影响使用 */
    }
  }

  /** 真的在游戏里：指针锁在画布上，窗口还有焦点。 */
  function live() {
    return document.pointerLockElement === canvas && document.hasFocus();
  }

  /** 补一次点击：按下再松开，两下都交给游戏的监听器。 */
  function fire() {
    if (!state.on || !held || !live()) {
      return;
    }
    const base = { bubbles: true, cancelable: true, view: window, button: 0, detail: 1 };
    canvas.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    canvas.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
  }

  function start() {
    if (timer !== null) {
      return;
    }
    timer = setInterval(fire, Math.round(1000 / state.rate));
  }

  function stop() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function sync() {
    if (state.on && held && live()) {
      start();
    } else {
      stop();
    }
  }

  // 真实的按下 / 松开 / 失焦
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      held = true;
      sync();
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 0) {
      held = false;
      sync();
    }
  });
  window.addEventListener("blur", () => {
    held = false;
    sync();
  });
  document.addEventListener("pointerlockchange", sync);

  // 状态角标（只在开着的时候显示）
  const chip = document.createElement("div");
  chip.id = "ruian-clicker-chip";
  chip.hidden = true;
  document.body.appendChild(chip);

  function paint() {
    if (state.on) {
      chip.textContent = `连点器 ${state.rate} CPS · F7 关`;
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
    sync();
  }

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

  window.addEventListener("keydown", (e) => {
    if (e.key === "F7") {
      state.on = !state.on;
      save();
      paint();
      say(state.on ? `连点器已开 · ${state.rate} CPS` : "连点器已关");
    } else if (e.key === "F8") {
      const next = (RATES.indexOf(state.rate) + 1) % RATES.length;
      state.rate = RATES[next];
      save();
      paint();
      say(`连点器 · ${state.rate} CPS`);
    }
  });

  paint();

  // 供调试用：控制台里 ruianClicker.state 能看到当前设置
  window.ruianClicker = {
    state,
    fire,
    live,
  };
})();
