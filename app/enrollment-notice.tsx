// 依据《研究生课程学习与选课须知（2026-2027 学年）》（教务处）与
// 《物光学院 2026-2027 年课程设置》整理。正式安排请以教务处最新通知为准。
'use client';

import { useEffect, useState } from 'react';
import {
  BellRing,
  BookCheck,
  ClipboardCheck,
  Info,
  Phone,
  School,
  Stamp,
  TimerReset,
  TriangleAlert,
} from 'lucide-react';

const FALL_START = new Date('2026-09-04T12:30:00+08:00');
const FALL_END = new Date('2026-09-18T12:30:00+08:00');

type WindowState = 'soon' | 'open' | 'over';

function enrollmentWindowState(now: number): WindowState {
  if (now < FALL_START.getTime()) return 'soon';
  if (now < FALL_END.getTime()) return 'open';
  return 'over';
}

function formatRemain(ms: number) {
  if (ms <= 0) return '即将截止';
  const totalMinutes = Math.ceil(ms / 60_000);
  if (totalMinutes < 90) return `${totalMinutes} 分钟`;
  const totalHours = Math.ceil(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days} 天 ${hours} 小时` : `${hours} 小时`;
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function WindowBadge() {
  const now = useNow();
  const state = enrollmentWindowState(now);
  if (state === 'soon') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
        <TimerReset className="size-3.5" />
        距选课开始 {formatRemain(FALL_START.getTime() - now)}
      </span>
    );
  }
  if (state === 'open') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <BellRing className="size-3.5" />
        选课进行中 · 截止 {formatRemain(FALL_END.getTime() - now)}后
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
      <BellRing className="size-3.5" />
      网络选课已截止（2026-09-18 12:30）
    </span>
  );
}

const TIMELINE = [
  {
    date: '9月4日 12:30',
    title: '杭高院网络选课开始',
    detail: '登录选课系统完成选课并提交，标注核心课/专业课是否作为学位课。',
  },
  {
    date: '9月18日 12:30',
    title: '选课提交及审核截止',
    detail:
      '须依次通过导师、培养单位、所在院系审核；未提交或未完成审核的选课无法进入选课名单（导师为必须审核环节，请务必提醒）。',
  },
  {
    date: '课程开课两周内',
    title: '可在线增选课程',
    detail: '自提交之日起须在 10 天内完成各角色审核，否则申请无效。',
  },
  {
    date: '课程学时过半前',
    title: '可在线退课',
    detail: '学时过半后一律不能退课；学位课/非学位课属性变更须在课程考核前 10 天提出。',
  },
];

export default function EnrollmentNotice() {
  return (
    <section className="py-6">
      <div className="section-heading mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p>ENROLLMENT GUIDE</p>
          <h2>选课须知</h2>
          <div className="section-description">
            依据《研究生课程学习与选课须知（2026-2027 学年）》整理，选课前请通读原文并以教务处最新通知为准。
          </div>
        </div>
        <WindowBadge />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold">本学期关键时间节点</h3>
        <div className="mt-3 grid gap-2">
          {TIMELINE.map((item) => (
            <div
              className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-4"
              key={item.title}
            >
              <span className="shrink-0 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                {item.date}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">{item.title}</p>
                <p className="text-xs leading-5 text-slate-500">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-blue-50/70 px-3 py-2 text-xs leading-5 text-blue-800">
          选课学分要求：秋季学期、春季学期选课均不低于 10
          学分（不含《人文系列讲座（HIAS讲堂）》《科学前沿讲座》学分）；夏季学期视需求选课。
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <BookCheck className="size-4 text-blue-600" /> 学位课规则
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>
              硕士生与直博生：至少修读本一级学科或专业学位领域
              <strong> 2 门核心课（学科核心课/专业核心课）+ 2 门专业课 </strong>
              作为学位课（核心课、专业课须在系统中勾选为学位课，本工具的「学位属性」开关即对应此项）。
            </li>
            <li>
              核心课包含学科核心课与专业核心课；本工具「培养要求」页只把被标记为“学位课”的核心课/专业课计入学位课门数与学分。
            </li>
            <li>
              研讨课、实验课、实践课和两类讲座只能作为非学位课（专业选修课）修读，不能勾选为学位课。
            </li>
            <li>
              学科核心课/专业核心课/专业课可以作为学位课，也可以作为非学位课；具体按系统勾选与培养方案认定。
            </li>
            <li>
              普博生须至少选择 4
              学分专业学位课程，其中至少 1 门硕博通用或博士专属的核心课/专业课作为学位课。
            </li>
            <li>专业学位课建议在本学科专业类课程中修读，跨学科课程须经导师和学院审核。</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <Stamp className="size-4 text-amber-600" /> 公共必修与英语
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>
              <strong>《新时代中国特色社会主义理论与实践》《自然辩证法概论》必须在一年级秋季学期修读。</strong>
              《学术道德与学术写作规范》根据实际开课安排修读（秋季、春季均可开设，不限于秋季）。
            </li>
            <li>
              硕士学位英语有免修免考、慕课、英语
              A 三条路径，符合条件（如考研英语一≥70、CET-6≥600、雅思≥7、托福≥100）可申请免修，成绩记为
              EX 并直接获得学分（可在页面顶部汇总卡的「英语免修免考」开关一键开启：公共必修课自动计入
              3 学分，英语班级课程不再排课/推荐；是否取得免修资格以学校最终审核结果为准）。
            </li>
            <li>
              硕士修读《中国马克思主义与当代》《博士学位英语》不计入毕业要求的课程学习学分（直博生除外，见培养要求页注）。
            </li>
            <li>
              工程硕士须修《工程伦理》（1 学分），其他类型硕士按培养方案确定。
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <ClipboardCheck className="size-4 text-emerald-600" /> 公选、创新与讲座学分
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>
              学术型硕士公选课 ≥2 学分；专业型硕士 ≥3 学分，其中{' '}
              <strong>1 学分为创新创业模块课程</strong>（如《创业管理》《创业启程》，课程属性为公共选修课，见本工具学分进度中的“创新创业课”）。
            </li>
            <li>公选课实行限选、先到先得；体育类公选课每学期限选 1 门。</li>
            <li>
              《科学前沿讲座》《HIAS 讲堂》人文讲座：听讲 20 学时计 1
              学分，须报名与考勤，学时仅当学年有效。
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <TriangleAlert className="size-4 text-rose-600" /> 考核与补考规则
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>
              一般课程：成绩低于 60 分/不及格可申请补考一次或重修一次；思政课不及格只能重修；补考通过按
              “60/及格/通过”记载。
            </li>
            <li>
              <strong>硕士学位英语执行公共外语专门规定，补考规则与普通课程不同</strong>
              ——请勿直接把“一次补考”规则套用于硕士学位英语，相关安排以教务处/外语教学部门的专门通知为准。
            </li>
            <li>缓考批复后两年内未取得成绩，自两年起课程自动计“0/不及格/未通过”。</li>
            <li>
              硕士生一学期两门学位课不及格、经重修仍有一门不及格，或累计三门学位课不及格，将按《学生管理规定》处理——请合理控制每学期选课量。
            </li>
            <li>禁止囤课卖课、使用插件等非正常方式选课；谨防冒充教务人员的诈骗。</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 font-bold">
            <Info className="size-4 text-sky-600" /> 课程评估、外选课与变更审核
          </h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>
              课程评估：课程进行到约 2/3 时开始课程评估；授课教师本人授课学时完成一半后开始教师评估。未按规定完成评估可能影响成绩在线查询。
            </li>
            <li>
              外选课：原则上仅限核心课；每人每学年至多 2
              门；需填写外选课申请表并经审批；成绩需由开课单位教务部门出具正式成绩单。
            </li>
            <li>
              网络选课结束后，增选、退课、学位课/非学位课属性变更均须在线申请并完成相关审核：增选应在课程开课两周内提出；退课应在课程学时完成一半前提出；学位属性变更应在课程考核前 10 天提出。
            </li>
            <li>申请提交后，请提醒相关审核角色在规定期限内完成审核。</li>
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-2 font-bold">
          <Phone className="size-4 text-slate-600" /> 咨询与帮助
        </h3>
        <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 md:grid-cols-2">
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <School className="mt-1 size-4 shrink-0 text-slate-400" />
            <span>
              物光学院教学主管（选课问题）：韩老师 0571-86087553，3 号楼 3A-300
            </span>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <School className="mt-1 size-4 shrink-0 text-slate-400" />
            <span>杭高院教务处：0571-86088963，13 号楼 405</span>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <School className="mt-1 size-4 shrink-0 text-slate-400" />
            <span>选课系统登录问题：网络中心 010-88256622（国科大北京）</span>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <Info className="mt-1 size-4 shrink-0 text-slate-400" />
            <span>
              考试信息查询：UCAS 课程考试信息（jwxk.ucas.ac.cn）；成绩查询：以
              SEP/学校规定入口为准；通知发布：学在 HIAS 公众号。
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
