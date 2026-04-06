import { useQuery } from '@apollo/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrandLogoMark } from '../components/BrandLogoMark';
import { LIST_LEADS_2026_YINLIU } from '../graphql/operations';
import type { Lead2026YinliuListRow, ListLeads2026YinliuData } from '../types/lead2026';
import { friendlyRequestErrorMessage } from '../utils/friendlyRequestError';

const LIST_PAGE_SIZE = 100;

/** 非 HTTPS（如局域网 IP）下 Clipboard API 常失败，用 execCommand 兜底 */
function copyTextViaExecCommand(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText =
      'position:fixed;left:0;top:0;width:2px;height:2px;padding:0;border:none;outline:none;box-shadow:none;background:transparent';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* use execCommand */
  }
  return copyTextViaExecCommand(text);
}

function pickNamePhone(content: Record<string, unknown> | null | undefined): {
  childName: string;
  parentPhone: string;
} {
  if (!content || typeof content !== 'object') {
    return { childName: '—', parentPhone: '—' };
  }
  return {
    childName: String(content['姓名'] ?? '—'),
    parentPhone: String(content['联系电话'] ?? '—'),
  };
}

/** 详情弹窗：数组型选项（如多选）用顿号拼接，避免整段 JSON */
function formatShoujiNeirongDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    const primitive = (x: unknown): x is string | number | boolean =>
      typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean';
    if (value.every(primitive)) {
      return value.map((x) => String(x)).join('、');
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

const PHONE_FIELD_LABEL = '联系电话';

function LeadDetailDialog({
  row,
  onClose,
}: {
  row: Lead2026YinliuListRow;
  onClose: () => void;
}) {
  const [phoneCopyTip, setPhoneCopyTip] = useState<string | null>(null);
  const phoneCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (phoneCopyTimerRef.current) clearTimeout(phoneCopyTimerRef.current);
    };
  }, []);

  const handleCopyPhone = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || text === '—' || !/\d/.test(text)) return;
    const ok = await copyTextWithFallback(text);
    setPhoneCopyTip(ok ? '已复制到剪贴板' : '复制失败，请长按号码手动复制');
    if (phoneCopyTimerRef.current) clearTimeout(phoneCopyTimerRef.current);
    phoneCopyTimerRef.current = setTimeout(() => setPhoneCopyTip(null), 2500);
  }, []);

  const content = row.ud_shoujineirong_3bc0b9;
  const entries =
    content && typeof content === 'object' && !Array.isArray(content)
      ? Object.entries(content)
      : [];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-[#2C2C24]/25 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-detail-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-[#FEFEFA] p-6 shadow-[0_10px_40px_-10px_rgba(193,140,93,0.2)] transition-all duration-300 ease-out"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3
            id="lead-detail-title"
            className="font-display text-xl font-semibold text-[#2C2C24]"
          >
            收集详情
          </h3>
          <button
            type="button"
            className="shrink-0 rounded-full border-2 border-[#C18C5D] bg-transparent px-4 py-2 text-sm font-bold text-[#C18C5D] transition hover:bg-[#C18C5D]/10"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <p className="mb-4 text-xs text-[#78786C]">
          提交时间：{new Date(row.created_at).toLocaleString('zh-CN')}
        </p>
        {entries.length > 0 ? (
          <dl className="space-y-3 text-sm">
            {entries.map(([k, v]) => {
              const isPhone =
                k === PHONE_FIELD_LABEL &&
                v !== null &&
                v !== undefined &&
                typeof v !== 'object';
              const display = formatShoujiNeirongDisplayValue(v);
              const phoneText = isPhone ? display.trim() : '';
              const phoneClickable =
                isPhone &&
                phoneText &&
                phoneText !== '—' &&
                /\d/.test(phoneText);

              return (
                <div
                  key={k}
                  className="rounded-2xl border border-[#DED8CF]/50 bg-[#FDFCF8] px-4 py-3"
                >
                  <dt className="font-display font-semibold text-[#5D7052]">
                    {k}
                  </dt>
                  <dd className="mt-1 text-[#2C2C24]">
                    {phoneClickable ? (
                      <>
                        <button
                          type="button"
                          className="w-full rounded-xl px-1 py-1 text-left font-mono text-base text-[#2C2C24] underline decoration-[#5D7052]/35 decoration-dotted underline-offset-[5px] transition duration-300 ease-out hover:decoration-[#5D7052] hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7052]/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyPhone(phoneText);
                          }}
                          aria-label={`复制${PHONE_FIELD_LABEL} ${phoneText}`}
                        >
                          {phoneText}
                        </button>
                        {phoneCopyTip ? (
                          <p
                            className="mt-1.5 text-xs text-[#5D7052]"
                            role="status"
                          >
                            {phoneCopyTip}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="whitespace-pre-wrap break-words">
                        {display}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : (
          <p className="text-sm text-[#78786C]">暂无收集内容</p>
        )}
      </div>
    </div>
  );
}

export type DevUserKuSnapshot = {
  accountId: string;
  profileErrorMessage: string | null;
  profileQueryReturnedRows: number;
  userKuId: string | null;
  phone: string | null;
  identity: string | null;
};

export function AdminLeadHubPage({
  brandLogoUrl,
  identity,
  inviterUserLibraryId,
  devUserKuSnapshot,
  displayName,
  onOpenFillForm,
  onLogout,
}: {
  brandLogoUrl: string | null;
  identity: string;
  /** 用户库主键，用于生成 ?ref= 分享参数 */
  inviterUserLibraryId: string | null;
  /** 仅开发：页面上打印用户库查询结果（含手机号） */
  devUserKuSnapshot?: DevUserKuSnapshot;
  displayName: string;
  onOpenFillForm: () => void;
  onLogout: () => void;
}) {
  const shareUrl = useMemo(() => {
    const base = `${window.location.origin}${window.location.pathname}`;
    if (!inviterUserLibraryId) return base;
    return `${base}?ref=${encodeURIComponent(inviterUserLibraryId)}`;
  }, [inviterUserLibraryId]);
  const [copyTip, setCopyTip] = useState<string | null>(null);
  const shareInputRef = useRef<HTMLInputElement>(null);

  const copyShare = useCallback(async () => {
    setCopyTip(null);
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      ok = copyTextViaExecCommand(shareUrl);
    }
    if (ok) {
      setCopyTip('已复制到剪贴板');
    } else {
      const el = shareInputRef.current;
      el?.focus();
      el?.select();
      setCopyTip('自动复制不可用，已选中上方链接，请用系统菜单复制或长按输入框');
    }
    setTimeout(() => setCopyTip(null), 5000);
  }, [shareUrl]);

  const [detailRow, setDetailRow] = useState<Lead2026YinliuListRow | null>(
    null
  );

  const {
    data: listData,
    loading: listLoading,
    error: listError,
  } = useQuery<ListLeads2026YinliuData>(LIST_LEADS_2026_YINLIU, {
    variables: {
      limit: LIST_PAGE_SIZE,
      offset: 0,
      inviterYonghukuId: inviterUserLibraryId ?? '0',
    },
    skip: !inviterUserLibraryId,
    fetchPolicy: 'network-only',
  });

  const rows: Lead2026YinliuListRow[] =
    listData?.ud_wenjuanshouji_2026yinliu_cb3e5d ?? [];

  return (
    <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 md:py-14">
      {detailRow ? (
        <LeadDetailDialog row={detailRow} onClose={() => setDetailRow(null)} />
      ) : null}
      <header className="mb-8 text-center">
        <BrandLogoMark url={brandLogoUrl} title="问卷收集" className="mb-4" />
        <p className="font-display text-sm font-semibold text-secondary">
          管理台 · {identity}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{displayName}</p>
        {devUserKuSnapshot ? (
          <div
            className="mx-auto mt-3 max-w-lg rounded-2xl border border-border/80 bg-muted/50 px-3 py-2 text-left shadow-organic-sm"
            aria-label="开发调试：用户库查询结果"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              仅开发 · 用户库（含手机）
            </p>
            <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-foreground">
              帐户 ID：{devUserKuSnapshot.accountId}
              <br />
              GraphQL 错误：{devUserKuSnapshot.profileErrorMessage ?? '无'}
              <br />
              返回行数：{devUserKuSnapshot.profileQueryReturnedRows}
              <br />
              用户库 id：{devUserKuSnapshot.userKuId ?? '—'}
              <br />
              手机 ud_phone_one_dbcfc6：
              {devUserKuSnapshot.phone ?? '—'}
              <br />
              身份：{devUserKuSnapshot.identity ?? '—'}
            </p>
            {devUserKuSnapshot.profileErrorMessage?.includes(
              'Anonymous user'
            ) ? (
              <p className="mt-2 border-t border-border/60 pt-2 text-[11px] leading-snug text-destructive">
                说明：请求未带有效 JWT，Zion 按匿名用户鉴权；用户库表未对匿名开放
                SELECT，因此不是「没查到行」而是「无权限」。请用{' '}
                <code className="rounded bg-background px-1 text-foreground">
                  ?token=粘贴JWT
                </code>{' '}
                登录后再试，或在 Zion 为<strong>已登录角色</strong>开放该表的查询权限。
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            className="rounded-full border-2 border-secondary bg-transparent px-6 py-2.5 text-sm font-bold text-secondary transition hover:bg-secondary/10"
            onClick={onOpenFillForm}
          >
            去填问卷
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline"
            onClick={onLogout}
          >
            退出
          </button>
        </div>
      </header>

      <section className="mb-10 rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-card p-6 shadow-organic-sm md:p-8">
        <h2 className="font-display text-lg text-primary">分享填写链接</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          链接中的 <code className="rounded bg-muted px-1">ref</code>{' '}
          为您的用户库 ID；他人通过此链接填写并提交后，记录会带上邀请人（用户库）ID。
        </p>
        {!inviterUserLibraryId ? (
          <p className="mt-2 text-xs text-destructive" role="alert">
            未读到用户库记录，无法生成带 ref 的链接；请确认用户库已与当前帐户关联。
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={shareInputRef}
            readOnly
            className="w-full rounded-xl border border-border bg-background/80 px-4 py-3 text-sm text-foreground"
            value={shareUrl}
            aria-label="分享链接"
          />
          <button
            type="button"
            className="shrink-0 rounded-full bg-primary px-8 py-3 font-semibold text-primary-foreground shadow-organic-sm transition hover:opacity-95"
            onClick={() => void copyShare()}
          >
            复制链接
          </button>
        </div>
        {copyTip ? (
          <p className="mt-2 text-xs text-primary" role="status">
            {copyTip}
          </p>
        ) : null}
      </section>

      <section className="rounded-tl-[1.75rem] rounded-tr-[1.25rem] rounded-br-[2rem] rounded-bl-[1.35rem] border border-border bg-card p-6 shadow-organic-sm md:p-8">
        <h2 className="font-display text-lg text-primary">收集结果</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          默认仅展示<strong>邀请人为您</strong>（当前用户库）的记录；最近{' '}
          {LIST_PAGE_SIZE} 条，按提交时间倒序。点击一行可查看详情。
        </p>

        {!inviterUserLibraryId ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            未获取到您的用户库 ID，无法加载收集列表。
          </p>
        ) : null}

        {inviterUserLibraryId && listLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">加载中…</p>
        ) : null}
        {listError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {friendlyRequestErrorMessage(listError)}
          </p>
        ) : null}

        {inviterUserLibraryId &&
        !listLoading &&
        !listError &&
        rows.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">暂无数据</p>
        ) : null}

        {inviterUserLibraryId && rows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[280px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">提交时间</th>
                  <th className="py-2 pr-3 font-semibold">孩子姓名</th>
                  <th className="py-2 font-semibold">家长电话</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { childName, parentPhone } = pickNamePhone(
                    row.ud_shoujineirong_3bc0b9 ?? undefined
                  );
                  return (
                    <tr
                      key={String(row.id)}
                      tabIndex={0}
                      className="cursor-pointer border-b border-border/60 align-top transition-colors duration-300 ease-out hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      onClick={() => setDetailRow(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDetailRow(row);
                        }
                      }}
                    >
                      <td className="py-3 pr-3 text-muted-foreground">
                        {new Date(row.created_at).toLocaleString('zh-CN')}
                      </td>
                      <td className="py-3 pr-3 text-foreground">{childName}</td>
                      <td className="py-3 text-foreground">{parentPhone}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
