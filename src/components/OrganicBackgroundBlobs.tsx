/**
 * 背景装饰光斑：每个节点宽高相等 + rounded-full，避免百分比圆角在矩形上变成椭圆。
 */
export function OrganicBackgroundBlobs() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-x-hidden"
      aria-hidden
    >
      <div
        className="absolute left-[-12%] top-[8%] h-[clamp(14rem,42vmin,26rem)] w-[clamp(14rem,42vmin,26rem)] rounded-full bg-primary/22 blur-[76px]"
      />
      <div
        className="absolute bottom-[4%] right-[-10%] h-[clamp(12rem,38vmin,22rem)] w-[clamp(12rem,38vmin,22rem)] rounded-full bg-secondary/20 blur-[68px]"
      />
      <div
        className="absolute right-[0%] top-[40%] h-[clamp(9rem,30vmin,17rem)] w-[clamp(9rem,30vmin,17rem)] rounded-full bg-primary/14 blur-[56px]"
      />
    </div>
  );
}
