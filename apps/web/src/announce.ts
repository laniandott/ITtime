// 全局无障碍播报（aria-live）工具。
//
// 背景：全项目原来零个 aria-live 区域，各页面靠「条件渲染的 role="status"」播报——
// 屏幕阅读器对刚插入 DOM 的 live region 播报不可靠。现在改为：
// App.tsx 永久挂载两个 live region（polite / assertive），页面通过这里的函数写入。
//
// 三条铁律（缺一不可）：
// 1. live region 必须永久存在、永不卸载 → 由 App.tsx 保证，页面只负责写入文本；
// 2. 播报前先清空 + 强制 reflow → 否则相同文本第二次不会重播（读屏器去重）；
// 3. assertive 同一时刻只保留一条 → 后到的覆盖前一条，不排队（紧急错误不等候）。

let politeRegion: HTMLElement | null = null
let assertiveRegion: HTMLElement | null = null

/** App.tsx 挂载时调用，把两个永久 live region 的 DOM 引用注册进来。 */
export function registerLiveRegions(polite: HTMLElement | null, assertive: HTMLElement | null) {
  politeRegion = polite
  assertiveRegion = assertive
}

function writeLiveRegion(region: HTMLElement | null, message: string) {
  if (!region || !message) return
  // 先清空；读一次 offsetHeight 强制 reflow，让浏览器先把「空」处理掉，
  // 再写入新文本——否则连续播报相同内容时，屏幕阅读器不会重播。
  region.textContent = ''
  void region.offsetHeight
  region.textContent = message
}

/** 礼貌播报：计时启停、打卡、待办完成/删除、筛选数量变化等非紧急反馈。 */
export function announce(message: string) {
  writeLiveRegion(politeRegion, message)
}

/** 紧急播报：校验失败、保存/删除失败等需要用户立即处理的问题（覆盖式，不排队）。 */
export function announceUrgent(message: string) {
  writeLiveRegion(assertiveRegion, message)
}
