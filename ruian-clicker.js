/**
 * Ruian 连点器（auto clicker）——把 Eaglercraft-26.2 客户端里那套
 * `autoclickerEnabled / autoclickerLastMs / autoclickerRandom / keyAutoClicker`
 * 的行为在页面层等价实现：
 *
 *   - 按键开关：按一次开，再按一次关（开着就一直点，不用按住鼠标）；
 *   - 随机间隔（autoclickerRandom）：每次间隔在 ±15% 内浮动，不会像节拍器一样死板；
 *   - 只在指针锁定、窗口有焦点（也就是真的在游戏里、没开任何界面）时才点，
 *     所以背包、箱子、聊天、菜单里不会误点；
 *   - 切后台 / 失焦 / 退出指针锁定，立刻停。
 *
 *   F7  开 / 关
 *   F8  换档：2 / 4 / 6 / 8 / 10 / 12 / 16 / 20 CPS
 *
 * 设置记在 localStorage，刷新后保留。游戏本体（wasm）一个字没动。
 */
(() => {
  const RATES = [2, 4, 6, 8, 10, 12, 16, 20];
  const DEFAULT_RATE = 10;
  const STORAGE = "ruian.clicker.v2";
  const JITTER = 0.15;

  /** 画布是加载完之后才建的，所以每次都现找。 */
  function canvas() {
    return document.getElementById("incari-canvas") || document.querySelector("canvas");
  }

  const state = { on: false, rate: DEFAULT_RATE };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    if (typeof saved.on === "boolean") state.on = saved.on;
    if (RATES.includes(saved.rate)) state.rate = saved.rate;
  } catch {
    /* 用默认值 */
  }

  let timer = null;

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

  /** 补一次点击：按下再松开，两下都交给游戏自己的监听器。 */
  function fire() {
    const el = canvas();
    if (!state.on || !live() || el === null) {
      return;
    }
    const base = { bubbles: true, cancelable: true, view: window, button: 0, detail: 1 };
    el.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));
    el.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
  }

  /** 下一次的间隔：基准 + 随机抖动，模拟真手点。 */
  function nextDelay() {
    const base = 1000 / state.rate;
    const spread = base * JITTER;
    return Math.max(1, Math.round(base + (Math.random() * 2 - 1) * spread));
  }

  function schedule() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!state.on || !live()) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      fire();
      schedule();
    }, nextDelay());
  }

  document.addEventListener("pointerlockchange", schedule);
  window.addEventListener("blur", schedule);
  window.addEventListener("focus", schedule);

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
      chip.textContent = `连点器 ${state.rate} CPS · F7 关`;
      chip.hidden = false;
    } else {
      chip.hidden = true;
    }
    schedule();
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "F7") {
      state.on = !state.on;
      save();
      paint();
      say(state.on ? `连点器已开 · ${state.rate} CPS` : "连点器已关");
    } else if (e.key === "F8") {
      state.rate = RATES[(RATES.indexOf(state.rate) + 1) % RATES.length];
      save();
      paint();
      say(`连点器 · ${state.rate} CPS`);
    }
  });

  paint();

  // 调试用：控制台里 ruianClicker.state 看当前设置
  window.ruianClicker = { state, fire, live };
})();
