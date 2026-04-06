/** 与原先独立标题行一致：Fraunces + 响应字号 + 标题字重（preflight 会清空 h1 默认粗细） */
const titleHeadingClass =
  'font-display text-3xl md:text-5xl font-semibold text-foreground';

export function BrandLogoMark({
  url,
  title,
  /** 整段作为页面主标题（仅问卷主页使用，保证只有一个 h1） */
  isPrimaryPageHeading = false,
  className = '',
}: {
  url: string | null | undefined;
  title?: string;
  isPrimaryPageHeading?: boolean;
  className?: string;
}) {
  const hasLogo = Boolean(url?.trim());
  const rowClass = `flex flex-wrap items-center justify-center gap-3 md:gap-5 ${className}`;

  const logoImg = hasLogo ? (
    <img
      key={url}
      src={url!}
      alt="天启无书"
      className="h-12 max-h-16 w-auto max-w-[200px] shrink-0 object-contain md:h-16"
      loading="lazy"
      decoding="async"
    />
  ) : null;

  if (title) {
    if (isPrimaryPageHeading) {
      return (
        <h1 className={`${rowClass} ${titleHeadingClass}`}>
          {logoImg}
          <span>{title}</span>
        </h1>
      );
    }
    return (
      <div
        className={`${rowClass} ${titleHeadingClass}`}
        aria-label={title}
      >
        {logoImg}
        <span>{title}</span>
      </div>
    );
  }

  if (hasLogo) {
    return <div className={`flex justify-center ${className}`}>{logoImg}</div>;
  }

  return null;
}
