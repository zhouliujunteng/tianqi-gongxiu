/**
 * 背景装饰光斑。
 *
 * 之前用 `filter: blur(76px)` 做柔光，在微信内置浏览器（iOS WKWebView）里
 * 全屏固定定位 + 大面积高斯模糊会在滚动时吃满显存，轻则卡顿、重则被系统回收
 * 后自动重载页面（表现为「滑到一半突然刷新回到顶部」）。
 * 这里改用径向渐变实现同样的柔光效果，几乎零合成成本。
 */
export function OrganicBackgroundBlobs() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-x-hidden"
      aria-hidden
    >
      <div
        className="absolute left-[-12%] top-[8%] h-[clamp(14rem,42vmin,26rem)] w-[clamp(14rem,42vmin,26rem)] rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(93,112,82,0.26) 0%, rgba(93,112,82,0.14) 38%, rgba(93,112,82,0) 72%)',
        }}
      />
      <div
        className="absolute bottom-[4%] right-[-10%] h-[clamp(12rem,38vmin,22rem)] w-[clamp(12rem,38vmin,22rem)] rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(193,140,93,0.24) 0%, rgba(193,140,93,0.12) 38%, rgba(193,140,93,0) 72%)',
        }}
      />
      <div
        className="absolute right-[0%] top-[40%] h-[clamp(9rem,30vmin,17rem)] w-[clamp(9rem,30vmin,17rem)] rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(93,112,82,0.16) 0%, rgba(93,112,82,0.08) 38%, rgba(93,112,82,0) 72%)',
        }}
      />
    </div>
  );
}
