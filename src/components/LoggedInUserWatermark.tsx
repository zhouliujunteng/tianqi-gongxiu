type LoggedInUserWatermarkProps = {
  userId: string;
};

export function LoggedInUserWatermark({ userId }: LoggedInUserWatermarkProps) {
  const chars = userId.trim().split('');
  if (chars.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-2 top-1/2 z-40 -translate-y-1/2 select-none opacity-20 md:right-4 md:opacity-25"
    >
      <div className="rounded-full border border-[#DED8CF]/40 bg-[#FDFCF8]/35 px-2 py-4 backdrop-blur-[1px]">
        <div className="flex flex-col items-center gap-1 font-display text-sm font-semibold text-[#5D7052]/85">
          {chars.map((char, idx) => (
            <span key={`${char}-${idx}`} className="leading-none">
              {char}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
