import type { CSSProperties, ReactNode } from 'react';
import { isCampParticipationFeeNonRefundable, type CampPhase } from '../constants/camp2026';

type CampSchedule = {
  dateRange: string;
  deadline: string;
};

type Props = {
  campPhase: CampPhase;
  campPhaseLabel: string;
  schedule: CampSchedule;
};

const PAIN_TAGS = [
  '拖沓磨蹭',
  '厌学辍学',
  '沉迷手机',
  '抑郁内耗',
  '消极对抗',
  '无内驱力',
] as const;

const PROBLEM_LINES = [
  '拖沓磨蹭、厌学辍学、拒绝上学',
  '沉迷手机、日夜颠倒、情绪暴躁',
  '抑郁内耗、自我封闭、甚至自残',
  '懒惰成性、花钱无度、挑食挑剔',
  '消极对抗、冷漠无情、毫无内驱力',
] as const;

const PATH_ITEMS: { from: string; to: string }[] = [
  { from: '被动型', to: '主动型' },
  { from: '要我学', to: '我要学' },
  { from: '适应我', to: '我适应' },
  { from: '享受型', to: '奋斗型' },
];

const CURRICULUM: { day: string; theme: string; value: string }[] = [
  { day: '1', theme: '认知孩子 + 根治自我中心', value: '看清问题本质，破除溺爱误区' },
  { day: '2', theme: '好孩子标准 + 四大内因', value: '树立正确教育标尺' },
  { day: '3', theme: '内驱力 · 案例深度拆解', value: '找到唤醒孩子自驱的钥匙' },
  { day: '4', theme: '想学 - 能力 - 成绩铁三角', value: '打通学习底层逻辑' },
  { day: '5', theme: '启动自教育', value: '让孩子自己管自己' },
  { day: '6', theme: '父母本分 + 五项基本原则', value: '回归父母定位，不越位不缺位' },
  { day: '7', theme: '因材施教 + 教育三步曲', value: '适配孩子天性，精准养育' },
  { day: '8', theme: '厌世厌学 · 根源破局', value: '从抗拒学习到主动求学' },
  { day: '9', theme: '沉迷手机 · 彻底解决方案', value: '不吼不骂，告别手机依赖' },
  { day: '10', theme: '抑郁内耗 · 心理重建', value: '重建阳光心态，远离内耗' },
  { day: '11', theme: '规则 · 成长真经', value: '建立家庭规则，孩子自觉遵守' },
  { day: '12', theme: '有效沟通 · 攻心为上（上）', value: '最有效的沟通是做对，非语言' },
  { day: '13', theme: '有效沟通 · 攻心为上（下）', value: '了知次序的重要性' },
  { day: '14', theme: '目标 + 培优八步 · 结营', value: '固化成果，长期持续蜕变' },
];

const OUTCOMES = [
  '掌握根源解题思路，不再盲目焦虑',
  '找到唤醒内驱力的完整路径',
  '获得成长困境一站式解决方案',
  '懂得 0-20 岁孩子卓越心智构建核心',
  '亲子关系缓和，孩子从「逼不动」变「主动拼」',
] as const;

const AUDIENCE = [
  '孩子有行为 / 心理偏差，想彻底解决的家庭',
  '希望养出主动学习、自律自强真学霸的家庭',
  '想自我成长、寻找教育根本的父母 / 教育人',
] as const;

function Blob({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute blur-3xl opacity-25 ${className ?? ''}`}
      style={style}
    />
  );
}

function SectionShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-tl-[2rem] rounded-tr-[1.35rem] rounded-br-[2.25rem] rounded-bl-[1.5rem] border border-border/60 bg-[#FEFEFA] p-4 shadow-[0_4px_20px_-2px_rgba(93,112,82,0.14)] md:p-6 ${className ?? ''}`}
    >
      {children}
    </section>
  );
}

export function CampIntroShowcase({ campPhase, campPhaseLabel, schedule }: Props) {
  const isNonRefundableParticipationFee = isCampParticipationFeeNonRefundable(campPhase);

  return (
    <div className="relative mb-6 space-y-6 overflow-hidden md:space-y-7">
      <Blob
        className="-left-24 -top-16 h-72 w-72"
        style={{
          borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
          background: '#5D7052',
        }}
      />
      <Blob
        className="-right-20 top-40 h-64 w-64"
        style={{
          borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%',
          background: '#C18C5D',
        }}
      />

      {/* Hero */}
      <header className="relative overflow-hidden rounded-tl-[2.25rem] rounded-tr-[1.5rem] rounded-br-[2.5rem] rounded-bl-[1.75rem] border border-border/50 bg-gradient-to-br from-[#FEFEFA] via-background to-accent/30 p-5 shadow-organic md:p-8">
        <div className="max-w-3xl">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.28em] text-secondary">
              14 天深度伴学 · {campPhaseLabel}
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold leading-tight text-foreground md:text-4xl md:leading-tight">
              父母学对一次，孩子蜕变一生
            </h2>
            <p className="mt-3 font-display text-xl text-primary md:text-2xl">
              14 天线上共修营｜从根源解决成长难题
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
              天启无书 · 纠偏培优体系｜26 年教育沉淀 · 数千家庭验证 · 一站式心智构建
            </p>
            <div className="mt-4 grid grid-cols-3 gap-x-2 gap-y-2 sm:gap-x-3 sm:gap-y-2.5">
              {PAIN_TAGS.map((t) => (
                <span
                  key={t}
                  className="flex min-h-[2.5rem] items-center justify-center rounded-2xl border border-secondary/35 bg-secondary/10 px-1.5 py-2 text-center text-[11px] font-semibold leading-tight text-secondary shadow-[0_4px_16px_-6px_rgba(193,140,93,0.22)] transition duration-300 ease-out hover:-translate-y-0.5 sm:min-h-0 sm:px-2 sm:py-2.5 sm:text-xs md:text-sm"
                >
                  {t}
                </span>
              ))}
            </div>
            <p className="mt-4 rounded-[1.5rem] border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-medium leading-snug text-foreground md:text-base">
              <span className="text-primary">核心转化：</span>
              方向不对，努力白费；心性一正，行为自改。
            </p>
          </div>
        </div>
      </header>

      {/* Module 1 */}
      <SectionShell>
        <div>
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              模块 1
            </p>
            <h3 className="mt-2 font-display text-2xl text-foreground md:text-3xl">
              你家孩子，是否正在被这些问题困住？
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              孩子的行为偏差，根源都在心性与养育方式。
            </p>
            <ol className="mt-5 list-none space-y-2.5 p-0 text-sm leading-snug text-foreground/90 md:text-base md:leading-relaxed">
              {PROBLEM_LINES.map((line, index) => (
                <li
                  key={line}
                  className="flex gap-3 rounded-[1.25rem] border border-border/55 bg-white/40 px-3 py-3 md:gap-3.5 md:px-4 md:py-3.5"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/12 font-display text-sm font-bold tabular-nums text-primary md:h-10 md:w-10 md:text-base"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 self-center pt-0.5">{line}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 rounded-2xl border border-secondary/30 bg-secondary/5 p-3 text-sm font-medium leading-snug text-accent-foreground md:leading-relaxed">
              你越用力，孩子越叛逆？因为你一直在解决「行为」，没触碰「根源」。
            </p>
          </div>
        </div>
      </SectionShell>

      {/* Module 2 */}
      <SectionShell className="bg-gradient-to-b from-[#FEFEFA] to-muted/30">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          模块 2
        </p>
        <h3 className="mt-2 font-display text-2xl text-foreground md:text-3xl">
          我们不教技巧，只给问题解决的核心思想与底层逻辑
        </h3>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base">
          课程核心：4 大蜕变路径；两大核心目标：纠偏与培优。
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-2.5">
          {PATH_ITEMS.map((row) => (
            <div
              key={row.from}
              className="relative overflow-hidden rounded-2xl border-2 border-secondary/35 bg-[#FEFEFA] shadow-[0_6px_22px_-4px_rgba(168,84,72,0.18)] transition duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_12px_36px_-8px_rgba(93,112,82,0.22)]"
            >
              <p className="border-b border-border/50 bg-muted/40 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                蜕变路径
              </p>
              <div className="flex min-h-[5.25rem] items-stretch">
                <div className="flex min-w-0 flex-1 flex-col justify-center border-r border-dashed border-border/70 bg-gradient-to-b from-muted/50 to-muted/20 px-2 py-2">
                  <span className="text-[10px] font-bold text-destructive/90">之前</span>
                  <span className="mt-0.5 font-display text-xs font-semibold leading-tight text-muted-foreground line-through decoration-destructive/50 decoration-2 sm:text-sm">
                    {row.from}
                  </span>
                </div>
                <div
                  aria-hidden
                  className="flex w-9 shrink-0 items-center justify-center bg-secondary/15 font-display text-lg font-bold text-secondary"
                >
                  →
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center bg-gradient-to-br from-primary/15 to-primary/5 px-2 py-2">
                  <span className="text-[10px] font-bold text-primary">之后</span>
                  <span className="mt-0.5 font-display text-xs font-extrabold leading-tight text-primary sm:text-sm">
                    {row.to}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-[1.5rem] border border-destructive/25 bg-destructive/5 p-4">
            <h4 className="font-display text-lg text-destructive md:text-xl">纠偏</h4>
            <p className="mt-1.5 text-sm leading-snug text-accent-foreground md:leading-relaxed">
              根治养育造成的所有心性、行为问题。
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-primary/25 bg-primary/5 p-4">
            <h4 className="font-display text-lg text-primary md:text-xl">培优</h4>
            <p className="mt-1.5 text-sm leading-snug text-accent-foreground md:leading-relaxed">
              构建卓越心智，养出主动、自律、有内驱力的真学霸。
            </p>
          </div>
        </div>
      </SectionShell>

      {/* Module 3 — curriculum */}
      <SectionShell>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          模块 3
        </p>
        <h3 className="mt-2 font-display text-2xl text-foreground md:text-3xl">
          14 天系统课程 · 每天溯源问题核心
        </h3>
        <p className="mt-2 text-sm leading-snug text-muted-foreground">
          以下为营期主干安排，具体以当期群内通知为准。
        </p>

        <div className="mt-4 hidden md:block">
          <div className="overflow-hidden rounded-[1.25rem] border border-border/70">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-primary/10 font-display text-primary">
                <tr>
                  <th className="px-3 py-2 font-semibold">天数</th>
                  <th className="px-3 py-2 font-semibold">核心主题</th>
                  <th className="px-3 py-2 font-semibold">学习价值</th>
                </tr>
              </thead>
              <tbody>
                {CURRICULUM.map((row, i) => (
                  <tr
                    key={row.day}
                    className={i % 2 === 0 ? 'bg-background/80' : 'bg-muted/30'}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-secondary">
                      第 {row.day} 天
                    </td>
                    <td className="px-3 py-2 text-foreground/90 leading-snug">{row.theme}</td>
                    <td className="px-3 py-2 text-muted-foreground leading-snug">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 space-y-2 md:hidden">
          {CURRICULUM.map((row) => (
            <div
              key={row.day}
              className="rounded-xl border border-border/60 bg-background/60 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-display text-xs font-semibold text-secondary">
                  第 {row.day} 天
                </span>
                <span className="text-sm font-medium leading-snug text-foreground">{row.theme}</span>
              </div>
              <p className="mt-1 text-xs leading-snug text-muted-foreground">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* Module 4 — times */}
      <SectionShell className="border-secondary/30">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
          模块 4
        </p>
        <h3 className="mt-2 font-display text-2xl text-foreground md:text-3xl">
          每日 2 时段 · 灵活学习不耽误
        </h3>
        <p className="mt-2 text-sm leading-snug text-muted-foreground md:text-base md:leading-relaxed">
          任选 1 场完整参与即可，全职爸妈 / 上班族都能跟上。
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:gap-3">
          {[
            { label: '早', time: '06:00 — 08:00' },
            { label: '晚', time: '20:00 — 22:00' },
          ].map((slot) => (
            <div
              key={slot.label}
              className="rounded-[1.35rem] border border-border/70 bg-gradient-to-b from-background/80 to-accent/25 px-4 py-3 text-center shadow-[0_4px_20px_-2px_rgba(193,140,93,0.14)] transition duration-300 ease-out hover:-translate-y-0.5 md:rounded-[1.5rem] md:py-4"
            >
              <p className="font-display text-xs font-semibold text-secondary md:text-sm">{slot.label}</p>
              <p className="mt-1 font-display text-lg leading-tight text-foreground md:text-xl">{slot.time}</p>
            </div>
          ))}
        </div>
      </SectionShell>

      {/* Module 5 — outcomes */}
      <SectionShell>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          模块 5
        </p>
        <h3 className="mt-2 font-display text-2xl text-foreground md:text-3xl">
          学完你能收获什么？
        </h3>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {OUTCOMES.map((text) => (
            <li
              key={text}
              className="flex items-start gap-2.5 rounded-[1.25rem] border border-primary/20 bg-primary/5 px-3 py-3 text-sm leading-snug text-foreground md:text-base md:leading-relaxed"
            >
              <span className="mt-0.5 text-lg" aria-hidden>
                ✓
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </SectionShell>

      {/* Module 7 — pricing */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionShell>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
            模块 7
          </p>
          <h3 className="mt-2 font-display text-2xl text-foreground">收费标准 · 清晰透明</h3>
          <p className="mt-4 text-sm leading-relaxed text-foreground/90">
            未建档家长：本期学费 <span className="font-semibold text-primary">980 元</span>
            （原价 1980 元，限时特惠）。
          </p>
          <p className="mt-3 text-sm leading-relaxed text-foreground/90">
            已建档家长：免学费，仅需缴纳{' '}
            <span className="font-semibold text-secondary">
              {isNonRefundableParticipationFee ? '200 元参与费用' : '200 元押金'}
            </span>
            {isNonRefundableParticipationFee
              ? '（缴费后不退，请确认后报名）。'
              : '（全勤可按规则退还，详见营期规则说明）。'}
          </p>
          {isNonRefundableParticipationFee ? (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm leading-snug text-foreground/90">
              <span className="font-semibold text-destructive">重要说明：</span>
              已建档家长缴纳的 200 元为本期课程参与费用，不属于押金，缴费后不予退还。
            </div>
          ) : null}
          <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-3 text-sm leading-snug text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">本期时间：</span>
              {schedule.dateRange}
            </p>
            <p className="mt-2">
              <span className="font-semibold text-foreground">报名截止：</span>
              {schedule.deadline}
            </p>
            <p className="mt-2">缴费后由进群小助手邀请进群。</p>
          </div>
        </SectionShell>

        <SectionShell className="border-destructive/20">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-destructive">
            模块 8
          </p>
          <h3 className="mt-2 font-display text-2xl text-foreground">重要规则</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-snug text-foreground/90 md:leading-relaxed">
            <li>每期营期开启后，社群停止新增人员。</li>
            <li>
              每日设 2 个学习时段，灵活参与；两个时间段任选一场完成当日学习即可。
            </li>
            <li>未建档家长缺席超过 3 次，不能建档。</li>
            {isNonRefundableParticipationFee ? (
              <li>建档家长缴纳的 200 元为课程参与费用，缴费后不予退还。</li>
            ) : (
              <li>建档家长缺席超过 3 次，押金不予退还。</li>
            )}
            <li>
              课程开始 15 分钟后，会议室将自动关闭；请提前入会并保证设备与网络稳定，建议在平板或电脑端参会以减少打断。
            </li>
            <li>
              每日会议时间：早晨 6:00—8:00；晚间 20:00—22:00。
            </li>
          </ol>
          <p className="mt-4 rounded-2xl border border-secondary/30 bg-secondary/5 p-3 text-sm leading-snug text-accent-foreground md:leading-relaxed">
            <span className="font-semibold text-secondary">重要提醒：</span>
            「规则」是纠偏培优体系中一场重要的课程。陪伴众多严重偏差问题孩子的家庭的过程中，我们发现 95%
            以上问题严重的家庭，父母对规则都没有认知，家庭中没有「规则」，或无法建立行之有效的规则；本次共修营我们将会带领大家学习和体证这个部分。
          </p>
        </SectionShell>
      </div>

      {/* Module 9 */}
      <SectionShell>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          模块 9
        </p>
        <h3 className="mt-2 font-display text-2xl text-foreground md:text-3xl">服务对象</h3>
        <div className="mt-4 flex flex-col gap-2">
          {AUDIENCE.map((line) => (
            <div
              key={line}
              className="rounded-full border border-border/70 bg-background/60 px-4 py-2.5 text-sm leading-snug text-foreground/90 md:text-base"
            >
              {line}
            </div>
          ))}
        </div>
      </SectionShell>

      {/* Module 10 — closing */}
      <footer className="relative overflow-hidden rounded-tl-[2rem] rounded-tr-[1.5rem] rounded-br-[2.25rem] rounded-bl-[1.75rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-[#FEFEFA] to-secondary/10 p-6 text-center shadow-[0_10px_40px_-10px_rgba(193,140,93,0.2)] md:p-8">
        <p className="font-display text-xl font-semibold text-foreground md:text-2xl lg:text-3xl">
          教育的本质是唤醒，不是塑造。
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-snug text-muted-foreground md:text-base md:leading-relaxed">
          14 天，给自己一次改变的机会，给孩子一个重生的可能。望每一位学员：一次学习，终身受益。
        </p>
        <p className="mt-4 font-display text-sm font-semibold text-secondary md:text-base">
          立即报名｜缴费后由进群小助手邀请进群
        </p>
      </footer>
    </div>
  );
}
