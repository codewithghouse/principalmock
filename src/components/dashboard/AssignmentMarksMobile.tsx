import {
  FileText, CheckCircle, TrendingUp, Trophy, ChevronRight, ChevronLeft,
  Loader2, Clock, Download, Sparkles, Upload, AlertTriangle, Users,
} from "lucide-react";
import { toast } from "sonner";

// ── Types (mirrors AssignmentMarks.tsx) ───────────────────────────────────────
export interface AssignmentGroupMobile {
  homeworkId: string;
  title: string;
  className: string;
  teacherName: string;
  dueDate: any;
  results: any[];
  gradedCount: number;
  avgScore: number;
  topScore: number;
  topStudent: string;
}

export interface AssignmentMarksMobileProps {
  loading: boolean;
  groups: AssignmentGroupMobile[];
  filtered: AssignmentGroupMobile[];
  stats: {
    totalAssignments: number;
    totalGraded: number;
    avgScore: number;
    topStudent: string;
  };
  classes: string[];
  classFilter: string;
  setClassFilter: (c: string) => void;
  selectedGroup: AssignmentGroupMobile | null;
  onSelectGroup: (g: AssignmentGroupMobile) => void;
  onBackFromDetail: () => void;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const B1 = "#0A84FF", B2 = "#3395FF", B3 = "#5BA9FF", B4 = "#7CBBFF";
const BG = "#F5F5F7", BG2 = "#EBEBF0";
const T1 = "#1D1D1F", T2 = "#3A3A3C", T3 = "#6E6E73", T4 = "#A1A1A6";
const SEP = "rgba(10,132,255,0.07)";
const GREEN = "#34C759", RED = "#FF3B30", ORANGE = "#FF9500", GOLD = "#FFCC00";
const VIOLET = "#AF52DE";

const GRAD_PRIMARY = `linear-gradient(135deg, ${B1}, ${B2})`;
const SHADOW_SM  = "0 0 0 .5px rgba(10,132,255,.08), 0 2px 8px rgba(10,132,255,.09), 0 8px 24px rgba(10,132,255,.10)";
const SHADOW_LG  = "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)";
const SHADOW_BTN = "0 6px 22px rgba(10,132,255,.40), 0 2px 5px rgba(10,132,255,.20)";

// ── Helpers ──
const scoreLetter = (s: number) => {
  if (s >= 80) return { letter: "A", bg: "rgba(52,199,89,0.10)", color: "#248A3D", bdr: "rgba(52,199,89,0.22)", fill: `linear-gradient(90deg, ${GREEN}, #34C759)` };
  if (s >= 60) return { letter: "B", bg: "rgba(10,132,255,0.10)", color: B1,        bdr: "rgba(10,132,255,0.22)",  fill: `linear-gradient(90deg, ${B1}, ${B4})` };
  if (s >= 40) return { letter: "C", bg: "rgba(255,149,0,0.10)", color: "#86310C", bdr: "rgba(255,149,0,0.22)", fill: `linear-gradient(90deg, ${ORANGE}, #FFCC00)` };
  return          { letter: "D", bg: "rgba(255,59,48,0.10)", color: RED,       bdr: "rgba(255,59,48,0.22)",  fill: `linear-gradient(90deg, ${RED}, #FF6961)` };
};

const aiFeedback = (score: number, studentName: string, title: string): string => {
  const first = (studentName || "Student").split(" ")[0];
  const v = Math.floor(score) % 3;
  if (score >= 90) return [
    `Outstanding performance, ${first}! Demonstrates excellent mastery of ${title}.`,
    `Exceptional work! ${first} has shown a thorough understanding of all concepts in ${title}.`,
    `Brilliant submission, ${first}. Keep this level of excellence — you're a top performer!`,
  ][v];
  if (score >= 75) return [
    `Good job, ${first}! Solid understanding shown. A bit more depth could push you to the top.`,
    `Well done, ${first}. Key concepts covered well — revisit the finer details to excel further.`,
    `Nice work on ${title}, ${first}. You're on the right track; refine your approach to reach the top.`,
  ][v];
  if (score >= 60) return [
    `Decent effort, ${first}. Focus on the weaker areas of ${title} to improve your score.`,
    `You have a fair grasp, ${first}. Revisiting the core concepts will help you score higher.`,
    `Average performance. Consistent practice and revision of ${title} is recommended, ${first}.`,
  ][v];
  if (score >= 40) return [
    `${first} needs more effort. Review the ${title} material thoroughly and seek teacher guidance.`,
    `Below average performance. ${first} should revisit ${title} concepts and practice regularly.`,
    `More practice needed, ${first}. Focus on understanding the fundamentals before the next test.`,
  ][v];
  return `${first} requires immediate attention and support. Please review ${title} with extra guidance from the teacher.`;
};

const fmtDate = (val: any): string => {
  if (!val) return "—";
  const d = val?.toDate ? val.toDate() : new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const initialsOf = (name: string) =>
  (name || "").trim().split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase() || "??";

const avGrad = (seed: string) => {
  const palette = [
    "linear-gradient(135deg, #3395FF, #5BA9FF)",
    "linear-gradient(135deg, #0A84FF, #0A84FF)",
    "linear-gradient(135deg, #1A3090, #5BA9FF)",
    "linear-gradient(135deg, #0A84FF, #7CBBFF)",
  ];
  let h = 0;
  for (const c of seed || "") h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return palette[h % palette.length];
};

const avgTierChip = (avg: number) => {
  if (avg >= 80) return { label: "Excellent", color: "#34C759" };
  if (avg >= 60) return { label: "Good", color: "#88BBFF" };
  if (avg >= 45) return { label: "Average", color: "#FFDD55" };
  return { label: "Critical", color: "#FF6961" };
};

const avgScoreColor = (pct: number) =>
  pct >= 70 ? GREEN : pct >= 50 ? ORANGE : pct > 0 ? RED : T4;

// ── CSV export ──
const exportCSV = (group: AssignmentGroupMobile) => {
  const headers = ["Student Name", "Score /100", "Grade", "Feedback"];
  const rows = group.results.map(r => {
    const sc = r.score !== null && r.score !== undefined ? parseFloat(r.score) : null;
    const graded = sc !== null && !isNaN(sc);
    const fb = r.feedback || (graded ? aiFeedback(sc!, r.studentName || "", group.title) + " [AI]" : "");
    return [
      r.studentName || "",
      r.score ?? "—",
      graded ? scoreLetter(sc!).letter : "—",
      fb,
    ];
  });
  const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${group.title}_${group.className}_Marks.csv`.replace(/[^a-z0-9._-]/gi, "_");
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success("Marks downloaded!");
};

const AssignmentMarksMobile = ({
  loading, groups, filtered, stats,
  classes, classFilter, setClassFilter,
  selectedGroup, onSelectGroup, onBackFromDetail,
}: AssignmentMarksMobileProps) => {

  // ── Loading state ──
  if (loading) {
    return (
      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter', sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}
        className="pb-6 flex flex-col items-center justify-center py-10">
        <Loader2 className="w-8 h-8 animate-spin mb-3" style={{ color: B1 }} />
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: T4 }}>
          Loading assignments…
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — Marks Detail
  // ══════════════════════════════════════════════════════════════════════════
  if (selectedGroup) {
    const g = selectedGroup;
    const sorted = [...g.results].sort((a, b) => (parseFloat(b.score) || 0) - (parseFloat(a.score) || 0));
    const lowestScore = sorted.length
      ? sorted.map(r => parseFloat(r.score)).filter(n => !isNaN(n)).reduce((a, b) => Math.min(a, b), Infinity)
      : 0;
    const lowestStudent = sorted.find(r => parseFloat(r.score) === lowestScore)?.studentName || "—";

    const avgColor = avgScoreColor(g.avgScore);

    return (
      <div className="pb-6" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter', sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}>

        {/* Breadcrumb */}
        <div className="px-5 pt-3 flex items-center gap-[8px]">
          <button onClick={onBackFromDetail}
            className="flex items-center gap-1 text-[12px] font-semibold transition-opacity active:opacity-60"
            style={{ color: B1 }}>
            <ChevronLeft className="w-3 h-3" strokeWidth={2.5} />
            Assignments &amp; Marks
          </button>
          <span className="text-[12px]" style={{ color: T4 }}>/</span>
          <span className="text-[12px] font-semibold truncate max-w-[140px] capitalize" style={{ color: T2 }}>{g.title}</span>
        </div>

        {/* Marks hero */}
        <div className="mx-5 mt-3 rounded-[22px] bg-white p-5 relative overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <div className="absolute -top-6 -right-5 w-[100px] h-[100px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(10,132,255,0.06) 0%, transparent 70%)" }} />
          <div className="flex items-start justify-between gap-3 mb-3 relative">
            <div className="min-w-0 flex-1">
              <div className="text-[20px] font-semibold leading-tight tracking-[-0.4px] capitalize mb-[8px] truncate" style={{ color: T1 }}>
                {g.title}
              </div>
              <div className="text-[12px] font-semibold flex items-center gap-[8px] flex-wrap" style={{ color: T4 }}>
                <span className="px-[8px] py-[4px] rounded-full text-[12px] font-semibold text-white"
                  style={{ background: GRAD_PRIMARY }}>
                  {g.className}
                </span>
                <span>Teacher: {g.teacherName}</span>
                <span className="w-[3px] h-[3px] rounded-full" style={{ background: T4 }} />
                <span>Due: {fmtDate(g.dueDate)}</span>
              </div>
            </div>
            <button onClick={() => exportCSV(g)}
              className="h-[38px] px-[16px] rounded-[13px] flex items-center gap-[8px] text-[12px] font-semibold text-white whitespace-nowrap flex-shrink-0 transition-transform active:scale-95 relative overflow-hidden mt-[2px]"
              style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
              <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
              <Download className="w-[13px] h-[13px] relative z-10" strokeWidth={2.2} />
              <span className="relative z-10">Download</span>
            </button>
          </div>
          <div className="h-2 rounded-[4px] overflow-hidden" style={{ background: BG2 }}>
            <div className="h-full rounded-[4px]"
              style={{ width: `${Math.max(0, Math.min(100, g.avgScore))}%`, background: `linear-gradient(90deg, ${B1}, #7CBBFF)` }} />
          </div>
        </div>

        {/* Detail stat cards 2x2 */}
        <div className="grid grid-cols-2 gap-[12px] px-5 pt-3.5">
          {[
            { val: g.gradedCount, label: "Total Graded", color: GREEN, iconBg: "rgba(52,199,89,0.10)", iconBdr: "rgba(52,199,89,0.22)", Icon: CheckCircle },
            { val: `${g.avgScore}%`, label: "Avg Score", color: avgColor, iconBg: "rgba(255,149,0,0.10)", iconBdr: "rgba(255,149,0,0.22)", Icon: TrendingUp },
            { val: `${g.topScore}%`, label: "Top Score", color: GREEN, iconBg: "rgba(255,204,0,0.10)", iconBdr: "rgba(255,204,0,0.22)", Icon: Trophy },
            { val: g.topStudent.split(" ")[0] + (g.topStudent.split(" ").length > 1 ? " " + g.topStudent.split(" ")[1][0] + "." : ""), label: "Top Student", color: T1, iconBg: "rgba(10,132,255,0.10)", iconBdr: "rgba(10,132,255,0.18)", Icon: Users, valueSize: 13 },
          ].map((s, i) => (
            <div key={i} className="rounded-[18px] p-[16px] bg-white relative overflow-hidden"
              style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(10,132,255,0.10)" }}>
              <div className="absolute -top-4 -right-3 w-[60px] h-[60px] rounded-full pointer-events-none"
                style={{ background: `radial-gradient(circle, ${s.color}1A 0%, transparent 70%)` }} />
              <div className="w-7 h-7 rounded-[9px] flex items-center justify-center mb-[8px]"
                style={{ background: s.iconBg, border: `0.5px solid ${s.iconBdr}` }}>
                <s.Icon className="w-[13px] h-[13px]" style={{ color: s.color }} strokeWidth={2.4} />
              </div>
              <div className="font-semibold tracking-[-0.5px] leading-none mb-[4px] truncate" style={{ color: s.color, fontSize: s.valueSize || 22, letterSpacing: s.valueSize ? "-0.2px" : "-0.5px" }}>
                {s.val}
              </div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: T4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Section label */}
        <div className="px-5 pt-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: T4 }}>
          Student-wise Marks
          <div className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
        </div>

        {/* Marks table */}
        <div className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden"
          style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <div className="px-[16px] pt-[16px] pb-3" style={{ borderBottom: `0.5px solid ${SEP}` }}>
            <div className="text-[14px] font-semibold" style={{ color: T1 }}>Student-wise Marks</div>
          </div>

          {sorted.length === 0 ? (
            <div className="py-10 px-5 text-center">
              <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(10,132,255,0.20)" }} strokeWidth={1.8} />
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: T3 }}>No submissions yet</p>
            </div>
          ) : (
            sorted.map((r, i, arr) => {
              const sc = r.score !== null && r.score !== undefined && r.score !== "" ? parseFloat(r.score) : null;
              const graded = sc !== null && !isNaN(sc);
              const letter = graded ? scoreLetter(sc!) : null;
              const name = r.studentName || "Unknown";
              const fb = graded
                ? (r.feedback || aiFeedback(sc!, name, g.title))
                : "Not yet graded.";
              const needsAttention = graded && sc! < 40;
              return (
                <div key={r.id || i} className="flex flex-col"
                  style={{ borderBottom: i < arr.length - 1 ? `0.5px solid ${SEP}` : undefined }}>
                  <div className="flex items-center gap-[12px] px-[16px] py-[16px]">
                    <div className="w-[18px] text-center flex-shrink-0 text-[12px] font-semibold" style={{ color: T4 }}>
                      {i + 1}
                    </div>
                    <div className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center text-[13px] font-semibold text-white flex-shrink-0"
                      style={{ background: avGrad(name), boxShadow: "0 3px 10px rgba(10,132,255,0.24)" }}>
                      {initialsOf(name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-semibold tracking-[-0.2px] truncate" style={{ color: T1 }}>{name}</div>
                      <div className="text-[12px] font-semibold mt-[4px]" style={{ color: T4 }}>
                        Class {r.className || g.className}
                      </div>
                      {graded && (
                        <div className="h-1 rounded-[2px] overflow-hidden mt-[4px]" style={{ background: BG2, maxWidth: 120 }}>
                          <div className="h-full rounded-[2px]"
                            style={{ width: `${Math.max(0, Math.min(100, sc!))}%`, background: letter!.fill }} />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-[4px] flex-shrink-0">
                      <div className="text-[18px] font-semibold tracking-[-0.3px]" style={{ color: graded ? letter!.color : T4 }}>
                        {graded ? `${sc}/100` : "—"}
                      </div>
                      {graded && (
                        <div className="px-[12px] py-1 rounded-full text-[12px] font-semibold"
                          style={{ background: letter!.bg, color: letter!.color, border: `0.5px solid ${letter!.bdr}` }}>
                          {letter!.letter}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-[16px] pt-[12px] pb-[16px]"
                    style={{ background: needsAttention ? "rgba(255,59,48,0.04)" : "rgba(10,132,255,0.04)", borderTop: `0.5px solid ${SEP}` }}>
                    <div className="flex items-center gap-[4px] text-[12px] font-semibold uppercase tracking-[0.10em] mb-[8px]"
                      style={{ color: needsAttention ? RED : VIOLET }}>
                      {needsAttention
                        ? <><AlertTriangle className="w-[11px] h-[11px]" strokeWidth={2.3} /> AI Feedback · Needs Attention</>
                        : <><Sparkles className="w-[11px] h-[11px]" strokeWidth={2.3} /> AI Feedback</>}
                    </div>
                    <div className="text-[12px] leading-[1.65] font-normal" style={{ color: T3 }}>
                      {fb}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* AI dark card */}
        <div className="mx-5 mt-3 rounded-[22px] px-5 py-[16px] relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #0A84FF 0%, #0A84FF 48%, #0A84FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}>
          <div className="absolute -top-9 -right-5 w-[140px] h-[140px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-[8px] mb-[12px] relative z-10">
            <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Sparkles className="w-[13px] h-[13px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              AI Marks Intelligence
            </span>
          </div>
          <div className="text-[12px] leading-[1.72] relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
            <span className="capitalize">{g.title}</span> shows a class average of <strong style={{ color: "#fff", fontWeight: 600 }}>{g.avgScore}%</strong>.
            {g.topStudent !== "—" && <> <strong style={{ color: "#fff", fontWeight: 600 }}>{g.topStudent} ({g.topScore}%)</strong> demonstrates excellent understanding.</>}
            {lowestScore < 40 && lowestStudent !== "—"
              ? <> <strong style={{ color: "#fff", fontWeight: 600 }}>{lowestStudent} ({Math.round(lowestScore)}%)</strong> needs immediate remedial intervention — schedule extra sessions and notify parents.</>
              : " Keep up the consistent progress."}
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden mt-3 relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: `${g.avgScore}%`, label: "Avg Score", color: "#fff" },
              { val: `${g.topScore}%`, label: "Highest", color: "#34C759" },
              { val: isFinite(lowestScore) ? `${Math.round(lowestScore)}%` : "—", label: "Lowest", color: lowestScore < 40 ? "#FF6961" : "#fff" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-3 px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[20px] font-semibold leading-none mb-[4px]" style={{ color, letterSpacing: "-0.5px" }}>{val}</div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Back button */}
        <button onClick={onBackFromDetail}
          className="mx-5 mt-3.5 h-[42px] px-4 rounded-[14px] flex items-center gap-[8px] text-[13px] font-semibold bg-white transition-colors active:bg-[#F5F5F7]"
          style={{ color: T2, border: "0.5px solid rgba(10,132,255,0.14)", boxShadow: SHADOW_SM }}>
          <ChevronLeft className="w-[13px] h-[13px]" strokeWidth={2.5} />
          Back to Assignments
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Assignments List
  // ══════════════════════════════════════════════════════════════════════════
  const schoolAvgTier = avgTierChip(stats.avgScore);
  const hasData = groups.length > 0;

  return (
    <div className="pb-6" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter', sans-serif", background: BG, minHeight: "100vh", margin: "-12px -12px 0" }}>

      {/* Page head */}
      <div className="px-5 pt-3">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.6px]" style={{ color: T1 }}>
          Assignments &amp; Marks
        </h1>
        <p className="text-[12px] font-normal mt-1" style={{ color: T3 }}>
          Class-wise assignment marks submitted by teachers
        </p>
      </div>

      {/* Hero */}
      {hasData && (
        <div className="mx-5 mt-3.5 rounded-[22px] px-[16px] py-4 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1D1D1F 0%, #0A84FF 35%, #0A84FF 70%, #0A84FF 100%)",
            boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-9 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center justify-between mb-[16px] relative z-10 gap-2">
            <div className="flex items-center gap-[12px] min-w-0">
              <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
                <FileText className="w-[18px] h-[18px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
              </div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] mb-[4px]" style={{ color: "rgba(255,255,255,0.50)" }}>
                  School Avg Score
                </div>
                <div className="text-[28px] font-semibold text-white leading-none tracking-[-0.8px]">
                  {stats.avgScore}%
                </div>
              </div>
            </div>
            {stats.topStudent !== "—" && (
              <div className="flex items-center gap-[4px] px-3 py-[4px] rounded-full flex-shrink-0 max-w-[50%]"
                style={{ background: "rgba(255,204,0,0.20)", border: "0.5px solid rgba(255,204,0,0.35)" }}>
                <Trophy className="w-[11px] h-[11px] flex-shrink-0" style={{ color: "#FFDD55" }} strokeWidth={2.5} />
                <span className="text-[12px] font-semibold truncate" style={{ color: "#FFDD55" }}>{stats.topStudent}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: stats.totalAssignments, label: "Assignments", color: "#fff" },
              { val: stats.totalGraded, label: "Total Graded", color: "#34C759" },
              { val: `${Math.max(...groups.map(g => g.topScore), 0)}%`, label: "Top Score", color: schoolAvgTier.color },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[12px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[18px] font-semibold leading-none mb-[4px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat grid 2x2 */}
      <div className="grid grid-cols-2 gap-[12px] px-5 pt-3.5">
        {[
          { label: "Total Assignments", val: stats.totalAssignments, sub: "This term", subColor: T4, color: B1, Icon: FileText, iconBg: "rgba(10,132,255,0.10)", iconBdr: "rgba(10,132,255,0.18)", glowColor: "rgba(10,132,255,0.10)" },
          { label: "Total Graded", val: stats.totalGraded, sub: hasData ? `${stats.totalGraded} submission${stats.totalGraded === 1 ? "" : "s"}` : "No data", subColor: "#248A3D", color: GREEN, Icon: CheckCircle, iconBg: "rgba(52,199,89,0.10)", iconBdr: "rgba(52,199,89,0.22)", glowColor: "rgba(52,199,89,0.10)" },
          { label: "School Avg Score", val: hasData ? `${stats.avgScore}%` : "—", sub: hasData ? schoolAvgTier.label.toLowerCase() + " tier" : "No data", subColor: avgScoreColor(stats.avgScore) === ORANGE ? "#86310C" : avgScoreColor(stats.avgScore), color: avgScoreColor(stats.avgScore), Icon: TrendingUp, iconBg: "rgba(255,149,0,0.10)", iconBdr: "rgba(255,149,0,0.22)", glowColor: "rgba(255,149,0,0.10)" },
          { label: "Top Performer", val: stats.topStudent, sub: hasData ? `${Math.max(...groups.map(g => g.topScore), 0)}% · Grade ${scoreLetter(Math.max(...groups.map(g => g.topScore), 0)).letter}` : "No data", subColor: GOLD, color: T1, Icon: Trophy, iconBg: "rgba(255,204,0,0.10)", iconBdr: "rgba(255,204,0,0.22)", glowColor: "rgba(255,204,0,0.10)", isText: true },
        ].map((s, i) => (
          <div key={i} className="rounded-[20px] p-[16px] bg-white relative overflow-hidden"
            style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(10,132,255,0.10)" }}>
            <div className="absolute -top-4 -right-3 w-[65px] h-[65px] rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${s.glowColor} 0%, transparent 70%)` }} />
            <div className="absolute top-3 right-3 w-7 h-7 rounded-[9px] flex items-center justify-center"
              style={{ background: s.iconBg, border: `0.5px solid ${s.iconBdr}` }}>
              <s.Icon className="w-[13px] h-[13px]" style={{ color: s.color }} strokeWidth={2.4} />
            </div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.07em] mb-[8px]" style={{ color: T4 }}>{s.label}</div>
            {s.isText ? (
              <div className="text-[14px] font-semibold tracking-[-0.2px] mb-1 truncate" style={{ color: T1 }}>{s.val}</div>
            ) : (
              <div className="text-[28px] font-semibold leading-none tracking-[-0.8px] mb-1" style={{ color: s.color }}>{s.val}</div>
            )}
            <div className="text-[12px] font-semibold truncate" style={{ color: s.subColor }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      {classes.length > 1 && (
        <div className="flex gap-[8px] px-5 pt-3.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {classes.map(cls => {
            const active = classFilter === cls;
            return (
              <button key={cls} onClick={() => setClassFilter(cls)}
                className="h-[34px] px-4 rounded-[13px] text-[12px] font-semibold whitespace-nowrap flex-shrink-0 transition-transform active:scale-95"
                style={active
                  ? { background: GRAD_PRIMARY, color: "#fff", boxShadow: SHADOW_BTN }
                  : { background: "#fff", color: T3, border: "0.5px solid rgba(10,132,255,0.12)", boxShadow: SHADOW_SM }}>
                {cls}
              </button>
            );
          })}
        </div>
      )}

      {/* Section label */}
      <div className="px-5 pt-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: T4 }}>
        {classFilter === "All" ? "All Assignments" : `${classFilter} — Assignments`}
        <span className="px-[8px] py-[4px] rounded-full text-[12px] font-semibold ml-1"
          style={{ background: "rgba(10,132,255,0.10)", color: B1, border: "0.5px solid rgba(10,132,255,0.16)" }}>
          {filtered.length} {filtered.length === 1 ? "assignment" : "assignments"}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
      </div>

      {/* Assignment cards */}
      {filtered.length === 0 ? (
        <div className="mx-5 mt-3 rounded-[22px] p-10 bg-white text-center"
          style={{ boxShadow: SHADOW_SM, border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: "rgba(10,132,255,0.20)" }} strokeWidth={1.8} />
          <p className="text-[13px] font-semibold tracking-[-0.2px] mb-2" style={{ color: T1 }}>No assignment marks yet</p>
          <p className="text-[12px] leading-[1.5] max-w-[230px] mx-auto" style={{ color: T4 }}>
            Teachers enter marks via Teacher Dashboard → Assignments → Grade Assignment.
          </p>
        </div>
      ) : (
        filtered.map(g => {
          const allGraded = g.results.length > 0 && g.gradedCount === g.results.length;
          const avgColor = avgScoreColor(g.avgScore);
          const topColor = g.topScore >= 80 ? GREEN : g.topScore >= 60 ? B1 : g.topScore >= 40 ? ORANGE : RED;
          const accent = `linear-gradient(180deg, ${B1}, ${B4})`;

          return (
            <div key={g.homeworkId} className="mx-5 mt-3 rounded-[22px] bg-white overflow-hidden relative transition-transform active:scale-[0.98]"
              style={{ boxShadow: SHADOW_LG, border: "0.5px solid rgba(10,132,255,0.10)" }}>
              <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: accent }} />

              {/* Header */}
              <div className="flex items-start gap-[12px] pl-[24px] pr-[16px] pt-[16px] pb-4" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                <div className="w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0"
                  style={{ background: GRAD_PRIMARY, boxShadow: "0 4px 14px rgba(10,132,255,0.28)" }}>
                  <FileText className="w-[22px] h-[22px] text-white" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-semibold leading-tight tracking-[-0.3px] capitalize mb-[4px] truncate" style={{ color: T1 }}>
                    {g.title}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-[8px]">
                    <span className="px-[12px] py-1 rounded-full text-[12px] font-semibold text-white"
                      style={{ background: GRAD_PRIMARY, boxShadow: "0 2px 7px rgba(10,132,255,0.26)" }}>
                      {g.className}
                    </span>
                    <div className="flex items-center gap-[4px] text-[12px] font-semibold" style={{ color: T3 }}>
                      <div className="w-[18px] h-[18px] rounded-[6px] flex items-center justify-center text-white text-[12px] font-semibold"
                        style={{ background: avGrad(g.teacherName) }}>
                        {initialsOf(g.teacherName)}
                      </div>
                      <span className="truncate max-w-[110px]">{g.teacherName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-[4px] text-[12px] font-semibold" style={{ color: T4 }}>
                    <Clock className="w-[11px] h-[11px]" strokeWidth={2.4} />
                    Due: {fmtDate(g.dueDate)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-[4px] flex-shrink-0">
                  <div className="flex items-center gap-[4px] px-[12px] py-1 rounded-full text-[12px] font-semibold"
                    style={{
                      background: allGraded ? "rgba(52,199,89,0.10)" : "rgba(255,149,0,0.10)",
                      color: allGraded ? "#248A3D" : "#86310C",
                      border: `0.5px solid ${allGraded ? "rgba(52,199,89,0.22)" : "rgba(255,149,0,0.22)"}`,
                    }}>
                    {allGraded && <CheckCircle className="w-[10px] h-[10px]" strokeWidth={2.5} />}
                    {g.gradedCount}/{g.results.length} Graded
                  </div>
                  <div className="px-[12px] py-1 rounded-full text-[12px] font-semibold"
                    style={{ background: "rgba(10,132,255,0.10)", color: B1, border: "0.5px solid rgba(10,132,255,0.18)" }}>
                    {allGraded ? "Completed" : "Pending"}
                  </div>
                </div>
              </div>

              {/* Score strip */}
              <div className="flex" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                <div className="flex-1 py-3 flex flex-col items-center gap-1 relative" style={{ borderRight: `0.5px solid ${SEP}` }}>
                  <div className="text-[20px] font-semibold leading-none tracking-[-0.5px]" style={{ color: avgColor }}>
                    {g.gradedCount > 0 ? `${g.avgScore}%` : "—"}
                  </div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ color: T4 }}>Avg Score</div>
                  <div className="h-1 w-[80%] rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                    <div className="h-full rounded-[2px]" style={{ width: `${g.avgScore}%`, background: `linear-gradient(90deg, ${avgColor}, ${avgColor}AA)` }} />
                  </div>
                </div>
                <div className="flex-1 py-3 flex flex-col items-center gap-1 relative" style={{ borderRight: `0.5px solid ${SEP}` }}>
                  <div className="text-[20px] font-semibold leading-none tracking-[-0.5px]" style={{ color: topColor }}>
                    {g.gradedCount > 0 ? `${g.topScore}%` : "—"}
                  </div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ color: T4 }}>Top Score</div>
                  <div className="h-1 w-[80%] rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                    <div className="h-full rounded-[2px]" style={{ width: `${g.topScore}%`, background: `linear-gradient(90deg, ${topColor}, ${topColor}AA)` }} />
                  </div>
                </div>
                <div className="flex-1 py-3 flex flex-col items-center gap-1">
                  <div className="text-[20px] font-semibold leading-none tracking-[-0.5px]" style={{ color: B1 }}>
                    {g.results.length}
                  </div>
                  <div className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ color: T4 }}>Students</div>
                  <div className="h-1 w-[80%] rounded-[2px] overflow-hidden" style={{ background: BG2 }}>
                    <div className="h-full rounded-[2px]" style={{ width: "100%", background: `linear-gradient(90deg, ${B1}, ${B4})` }} />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 px-4 py-[12px]" style={{ background: "rgba(238,244,255,0.50)" }}>
                <button onClick={() => onSelectGroup(g)}
                  className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[8px] text-[12px] font-semibold text-white transition-transform active:scale-95 relative overflow-hidden"
                  style={{ background: GRAD_PRIMARY, boxShadow: SHADOW_BTN }}>
                  <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                  <ChevronRight className="w-[13px] h-[13px] relative z-10" strokeWidth={2.4} />
                  <span className="relative z-10">View Marks</span>
                </button>
                <button onClick={e => { e.stopPropagation(); exportCSV(g); }}
                  className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[8px] text-[12px] font-semibold transition-transform active:scale-95"
                  style={{ background: BG, color: T2, border: "0.5px solid rgba(10,132,255,0.16)", boxShadow: SHADOW_SM }}>
                  <Download className="w-[13px] h-[13px]" style={{ color: "rgba(10,132,255,0.6)" }} strokeWidth={2.2} />
                  Download
                </button>
                <button onClick={() => toast.info("Share with parents — coming soon")}
                  aria-label="Share assignment"
                  className="w-[42px] h-[42px] rounded-[13px] flex items-center justify-center transition-transform active:scale-90"
                  style={{ background: "rgba(52,199,89,0.10)", color: "#248A3D", border: "0.5px solid rgba(52,199,89,0.22)" }}>
                  <Upload className="w-[13px] h-[13px]" strokeWidth={2.2} />
                </button>
              </div>
            </div>
          );
        })
      )}

      {/* AI card — dashboard level */}
      {hasData && (
        <div className="mx-5 mt-3 rounded-[22px] px-5 py-[16px] relative overflow-hidden"
          style={{
            background: "linear-gradient(140deg, #0A84FF 0%, #0A84FF 48%, #0A84FF 100%)",
            boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
          }}>
          <div className="absolute -top-9 -right-5 w-[140px] h-[140px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center gap-[8px] mb-[12px] relative z-10">
            <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <Sparkles className="w-[13px] h-[13px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
            </div>
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              AI Assignment Intelligence
            </span>
          </div>
          <div className="text-[12px] leading-[1.72] relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
            <strong style={{ color: "#fff", fontWeight: 600 }}>{stats.totalGraded} submission{stats.totalGraded === 1 ? "" : "s"}</strong> graded across <strong style={{ color: "#fff", fontWeight: 600 }}>{stats.totalAssignments} assignment{stats.totalAssignments === 1 ? "" : "s"}</strong> with a school average of <strong style={{ color: "#fff", fontWeight: 600 }}>{stats.avgScore}%</strong>.
            {stats.topStudent !== "—" && <> <strong style={{ color: "#fff", fontWeight: 600 }}>{stats.topStudent}</strong> leads at <strong style={{ color: "#fff", fontWeight: 600 }}>{Math.max(...groups.map(g => g.topScore), 0)}%</strong>.</>}
            {stats.avgScore < 50 && " Consider scheduling remedial sessions for low-scoring students."}
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden mt-3 relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: stats.totalAssignments, label: "Assignments", color: "#fff" },
              { val: `${stats.avgScore}%`, label: "Avg Score", color: "#34C759" },
              { val: `${Math.max(...groups.map(g => g.topScore), 0)}%`, label: "Top Score", color: "#fff" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-3 px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[20px] font-semibold leading-none mb-[4px]" style={{ color, letterSpacing: "-0.5px" }}>{val}</div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default AssignmentMarksMobile;