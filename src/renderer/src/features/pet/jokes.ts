export const jokes = [
  '为什么程序员分不清万圣节和圣诞节？因为 Oct 31 == Dec 25！🎃🎄',
  '程序员去超市，妻子说：买一斤包子，如果有卖西瓜的买一个。程序员买了一个包子回家。😂',
  '猫咪为什么不想当程序员？因为一遇到 Bug，它就忍不住一爪子扑上去吃掉了…🐱',
  '产品经理：这个需求很小，改一行代码就行！程序员：好，我把你的需求给删了。🙂',
  '键盘上的 F5 键今天请假了，因为它被按得太“刷新”了！⌨️',
  '为什么电脑总感冒？因为它的 Windows 窗户天天开着吹风！💨',
  '小狗为什么不做数学题？因为每次算到二，它就忍不住“汪！汪！”🐶',
  '世界上有 10 种人，一种是懂二进制的，一种是不懂二进制的。',
  '大师，我怎样摆脱内卷？大师递来煎饼果子：趁热吃了，别卷了。🌯',
  '咖啡对打工人说：你以为你在喝我提神？其实是我借你的心跳在蹦迪！☕',
  '手机电量剩 1% 时最坚强，就像下班前最后一分钟的我！🔋',
  '代码能跑就千万别碰，哪怕你完全不知道它为什么能跑！✨',
  '什么是真正的默契？同事看了一眼表，我也看了一眼表，然后同时背上了包！🎒'
] as const

export function nextJoke(draw: number, previous?: number): number {
  if (previous === undefined) return Math.floor(draw * jokes.length)
  const index = Math.floor(draw * (jokes.length - 1))
  return index < previous ? index : index + 1
}
