import { useState, useEffect, useMemo } from "react";
import {
  FileText, Users, Percent, Trophy, AlertTriangle,
  ChevronRight, Loader2, Calendar, TrendingDown, TrendingUp
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where } from "firebase/firestore";
import ExamDetail from "@/components/ExamDetail";
import ExamsResultsMobile from "@/components/dashboard/ExamsResultsMobile";

/* ══════════════════════════════════════════════════════════════
   Shared types  (imported by ExamDetail)
══════════════════════════════════════════════════════════════ */
export interface ClassRow {
  section: string; appeared: number; passed: number; failed: number;
  passRate: number; topper: string; topperPct: number; avgPct: number;
}
export interface MeritEntry { rank: number; name: string; className: string; avgPct: number; }
export interface FailEntry  { name: string; className: string; avgPct: number; initials: string; }
export interface ExamGroup {
  name: string; dateLabel: string; totalStudents: number;
  passRate: number; avgPct: number; scores: any[];
  classSummary: ClassRow[]; meritList: MeritEntry[]; failList: FailEntry[];
}

/* ──────────────────────────────────────────────────────────── */
function chunk<T>(arr: T[], n: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
function fmtDate(str: string) {
  if (!str) return "";
  const d = new Date(str);
  return isNaN(d.getTime()) ? str
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function buildExamGroup(name: string, scores: any[]): ExamGroup {
  const appeared = scores.filter(s => !s.isAbsent && s.score !== null && s.score !== undefined);

  const classMap = new Map<string, any[]>();
  appeared.forEach(s => {
    const cls = s.className || s.classId || "Unknown";
    if (!classMap.has(cls)) classMap.set(cls, []);
    classMap.get(cls)!.push(s);
  });

  const classSummary: ClassRow[] = Array.from(classMap.entries()).map(([cls, rows]) => {
    const passed = rows.filter(r => r.percentage >= 50);
    const avg    = rows.reduce((a, r) => a + r.percentage, 0) / rows.length;
    const top    = [...rows].sort((a, b) => b.percentage - a.percentage)[0];
    return {
      section: cls, appeared: rows.length,
      passed: passed.length, failed: rows.length - passed.length,
      passRate: Math.round(passed.length / rows.length * 100),
      topper: top ? `${top.studentName} (${Math.round(top.percentage)}%)` : "—",
      topperPct: top?.percentage || 0, avgPct: Math.round(avg),
    };
  }).sort((a, b) => a.section.localeCompare(b.section));

  const stMap = new Map<string, { name: string; className: string; total: number; count: number }>();
  appeared.forEach(s => {
    if (!stMap.has(s.studentId))
      stMap.set(s.studentId, { name: s.studentName, className: s.className || s.classId || "", total: 0, count: 0 });
    const e = stMap.get(s.studentId)!; e.total += s.percentage; e.count++;
  });
  const meritList: MeritEntry[] = Array.from(stMap.values())
    .map(v => ({ name: v.name, className: v.className, avgPct: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avgPct - a.avgPct).slice(0, 5)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const fMap = new Map<string, { name: string; className: string; total: number; count: number }>();
  appeared.filter(s => s.percentage < 50).forEach(s => {
    if (!fMap.has(s.studentId))
      fMap.set(s.studentId, { name: s.studentName, className: s.className || s.classId || "", total: 0, count: 0 });
    const e = fMap.get(s.studentId)!; e.total += s.percentage; e.count++;
  });
  const failList: FailEntry[] = Array.from(fMap.values())
    .map(v => ({ name: v.name, className: v.className, avgPct: Math.round(v.total / v.count), initials: v.name?.substring(0, 2).toUpperCase() || "??" }))
    .sort((a, b) => a.avgPct - b.avgPct).slice(0, 8);

  const dates = [...new Set(scores.map(s => s.testDate || s.date || "").filter(Boolean))].sort();
  const dateLabel = dates.length === 0 ? "—"
    : dates.length === 1 ? fmtDate(dates[0])
    : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`;

  const totalPassed = appeared.filter(s => s.percentage >= 50).length;
  const totalAvg    = appeared.length ? appeared.reduce((a, s) => a + s.percentage, 0) / appeared.length : 0;

  return { name, dateLabel, totalStudents: appeared.length,
    passRate: appeared.length ? Math.round(totalPassed / appeared.length * 100) : 0,
    avgPct: Math.round(totalAvg), scores, classSummary, meritList, failList };
}

/* ══════════════════════════════════════════════════════════════
   Main Component
══════════════════════════════════════════════════════════════ */
const BORDER_COLORS = ["#1D1D1F", "#86310C", "#34C759"];
const GRADE_COLORS  = ["#34C759", "#0A84FF", "#86310C", "#FF3B30"];

// ═══════════════════════════════════════════════════════════════════════
// MOCK DATA — flip USE_MOCK_DATA to false to restore live Firestore data
// ═══════════════════════════════════════════════════════════════════════
const USE_MOCK_DATA = true;

const _erDate = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// 6 classes × 5 students × 3 exam groups = ~90 scores. Enough for rich exam groups.
const _STUDENTS_BY_CLASS: Record<string, Array<{ id: string; name: string }>> = {
  "Grade 6B":  [{ id: "stu-003", name: "Tara Iyer" }, { id: "stu-004", name: "Veer Khanna" }, { id: "stu-101", name: "Arjun Bose" }, { id: "stu-102", name: "Kiara Joshi" }, { id: "stu-103", name: "Mira Rana" }],
  "Grade 7C":  [{ id: "stu-009", name: "Rohit Yadav" }, { id: "stu-010", name: "Naina Singhania" }, { id: "stu-104", name: "Vivaan Bhargava" }, { id: "stu-105", name: "Ayesha Malik" }, { id: "stu-106", name: "Nilesh Pawar" }],
  "Grade 8A":  [{ id: "stu-011", name: "Ishaan Khanna" }, { id: "stu-012", name: "Meera Pillai" }, { id: "stu-107", name: "Aanya Trivedi" }, { id: "stu-108", name: "Dhruv Goyal" }, { id: "stu-109", name: "Vivek Soni" }],
  "Grade 8B":  [{ id: "stu-013", name: "Aarav Sharma" }, { id: "stu-014", name: "Ananya Iyer" }, { id: "stu-015", name: "Diya Menon" }, { id: "stu-016", name: "Rhea Patel" }, { id: "stu-017", name: "Saanvi Gupta" }],
  "Grade 9A":  [{ id: "stu-020", name: "Aditi Joshi" }, { id: "stu-021", name: "Shreya Bansal" }, { id: "stu-110", name: "Aryan Bansal" }, { id: "stu-111", name: "Shreya Iyer" }, { id: "stu-112", name: "Hriday Patel" }],
  "Grade 10A": [{ id: "stu-024", name: "Aditya Chopra" }, { id: "stu-025", name: "Sanya Bhatia" }, { id: "stu-026", name: "Yuvraj Saxena" }, { id: "stu-113", name: "Avantika Sen" }, { id: "stu-114", name: "Rohan Kapoor" }],
};
// Per-student score variance per class — tied to class strength
const _CLASS_AVG: Record<string, number> = { "Grade 6B": 51, "Grade 7C": 58, "Grade 8A": 76, "Grade 8B": 84, "Grade 9A": 87, "Grade 10A": 89 };

const _genGroup = (testName: string, dateOffset: number, deltaPerStudent: Record<string, number>) => {
  const scores: any[] = [];
  Object.entries(_STUDENTS_BY_CLASS).forEach(([className, students]) => {
    students.forEach((s, i) => {
      const base = _CLASS_AVG[className];
      const delta = deltaPerStudent[s.id] ?? (i === 0 ? 6 : i === 1 ? 3 : i === 2 ? -2 : i === 3 ? -5 : -8);
      const pct = Math.max(15, Math.min(99, base + delta));
      scores.push({
        id: `score-${testName}-${s.id}`,
        testId: `test-${testName}`, testName,
        studentId: s.id, studentName: s.name,
        className, classId: className.toLowerCase().replace(/\s+/g, "-"),
        percentage: pct, score: pct, maxScore: 100,
        testDate: _erDate(-dateOffset),
        schoolId: "mock-school-001", branchId: "mock-branch-001",
      });
    });
  });
  return scores;
};

// Aarav (stu-013) gets +6 from class avg (84 + 6 = 90 in math, etc.) — matches parent dashboard
const MOCK_ALL_SCORES: any[] = [
  ..._genGroup("Mid-Term Mathematics", 14, { "stu-013": 6, "stu-017": 9, "stu-014": 7, "stu-024": 8, "stu-007": -52 }),
  ..._genGroup("Mid-Term Science",     12, { "stu-013": 1, "stu-017": 9, "stu-014": 7, "stu-024": 8 }),
  ..._genGroup("Mid-Term English",     10, { "stu-013": -6, "stu-017": 9, "stu-014": 7 }),
];

// 5 upcoming tests
const MOCK_UPCOMING_EXAMS: any[] = [
  { id: "ut-1", testName: "Mathematics — Algebra Test",   subject: "Mathematics", classId: "cls-8b", className: "Grade 8B",  teacherId: "t-priya",   teacherName: "Mrs. Priya Mehta",   testDate: _erDate(3),  date: _erDate(3),  testType: "Written", maxScore: 50,  status: "Scheduled", schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "ut-2", testName: "Science — Force & Motion Quiz", subject: "Science",     classId: "cls-8b", className: "Grade 8B",  teacherId: "t-anil",    teacherName: "Dr. Anil Reddy",     testDate: _erDate(5),  date: _erDate(5),  testType: "Quiz",    maxScore: 25,  status: "Scheduled", schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "ut-3", testName: "English — Comprehension Test",  subject: "English",     classId: "cls-9a", className: "Grade 9A",  teacherId: "t-meena",   teacherName: "Mrs. Meena Kapoor",  testDate: _erDate(7),  date: _erDate(7),  testType: "Written", maxScore: 100, status: "Scheduled", schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "ut-4", testName: "Hindi — Vyakaran Test",         subject: "Hindi",       classId: "cls-7c", className: "Grade 7C",  teacherId: "t-deepa",   teacherName: "Mrs. Deepa Nair",    testDate: _erDate(9),  date: _erDate(9),  testType: "Written", maxScore: 50,  status: "Scheduled", schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "ut-5", testName: "Term 1 Final — Mathematics",    subject: "Mathematics", classId: "cls-10a",className: "Grade 10A", teacherId: "t-rashmi",  teacherName: "Mrs. Rashmi Pandey", testDate: _erDate(14), date: _erDate(14), testType: "Final",   maxScore: 100, status: "Scheduled", schoolId: "mock-school-001", branchId: "mock-branch-001" },
];

export default function ExamsResults() {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

  const [allScores,      setAllScores]      = useState<any[]>(USE_MOCK_DATA ? MOCK_ALL_SCORES : []);
  const [upcomingExams,  setUpcomingExams]  = useState<any[]>(USE_MOCK_DATA ? MOCK_UPCOMING_EXAMS : []);
  const [loading,        setLoading]        = useState(USE_MOCK_DATA ? false : true);
  const [selectedExam,   setSelectedExam]   = useState<ExamGroup | null>(null);

  /* ── fetch data ── */
  useEffect(() => {
    if (USE_MOCK_DATA) return; // Mock mode: allScores + upcomingExams pre-seeded above
    if (!userData?.schoolId) return;
    const go = async () => {
      try {
        /* 1. test_scores by schoolId + branchId */
        const scoreConstraints: any[] = [where("schoolId", "==", userData.schoolId)];
        if (userData.branchId) scoreConstraints.push(where("branchId", "==", userData.branchId));
        const scoresSnap = await getDocs(
          query(collection(db, "test_scores"), ...scoreConstraints)
        );
        const rawScores = scoresSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

        /* 2. enrich with className from tests (max 10 per "in" query) */
        const testIds = [...new Set(rawScores.map(s => s.testId).filter(Boolean))] as string[];
        const testsMap = new Map<string, any>();
        for (const ids of chunk(testIds, 10)) {
          const tSnap = await getDocs(query(collection(db, "tests"), where("__name__", "in", ids)));
          tSnap.docs.forEach(d => testsMap.set(d.id, { id: d.id, ...d.data() }));
        }
        const enriched = rawScores.map(s => {
          const t = testsMap.get(s.testId);
          return { ...s, className: s.className || t?.className || "", testDate: s.testDate || t?.testDate || t?.date || "" };
        });
        setAllScores(enriched);

        /* 3. upcoming tests via teachers (schoolId + branchId scoped) */
        const teacherConstraints: any[] = [where("schoolId", "==", userData.schoolId)];
        if (userData.branchId) teacherConstraints.push(where("branchId", "==", userData.branchId));
        const tSnap = await getDocs(
          query(collection(db, "teachers"), ...teacherConstraints)
        );
        const tIds = tSnap.docs.map(d => d.id);
        const upcoming: any[] = [];
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const testsScopeC: any[] = [where("schoolId", "==", userData.schoolId)];
        if (userData.branchId) testsScopeC.push(where("branchId", "==", userData.branchId));
        for (const ids of chunk(tIds, 10)) {
          if (!ids.length) continue;
          const uSnap = await getDocs(
            query(collection(db, "tests"),
              ...testsScopeC,
              where("teacherId", "in", ids))
          );
          uSnap.docs.forEach(d => {
            const data = { id: d.id, ...d.data() } as any;
            const examDate = new Date(data.testDate || data.date || 0);
            if (examDate >= today && data.status !== "Completed")
              upcoming.push(data);
          });
        }
        upcoming.sort((a, b) =>
          new Date(a.testDate || a.date || 0).getTime() - new Date(b.testDate || b.date || 0).getTime()
        );
        setUpcomingExams(upcoming);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    go();
  }, [userData?.schoolId, userData?.branchId]);

  /* ── derived: exam groups ── */
  const examGroups = useMemo<ExamGroup[]>(() => {
    const map = new Map<string, any[]>();
    allScores.forEach(s => {
      const key = s.testName || s.testId || "Unnamed Exam";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries())
      .map(([name, scores]) => buildExamGroup(name, scores))
      .sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));
  }, [allScores]);

  /* ── derived: latest exam ── */
  const latestExam = examGroups[0] || null;
  const prevExam   = examGroups[1] || null;

  /* ── derived: subject pass rates ── */
  const subjectData = useMemo(() => {
    const map = new Map<string, { passed: number; total: number }>();
    allScores.filter(s => !s.isAbsent && s.score !== null).forEach(s => {
      const subj = (s.subject || s.subjectName || "Unknown").trim();
      if (!map.has(subj)) map.set(subj, { passed: 0, total: 0 });
      const e = map.get(subj)!; e.total++;
      if (s.percentage >= 50) e.passed++;
    });
    return Array.from(map.entries())
      .map(([name, { passed, total }]) => ({ name: name.length > 8 ? name.slice(0, 8) : name, passRate: Math.round(passed / total * 100) }))
      .sort((a, b) => a.passRate - b.passRate);
  }, [allScores]);

  /* ── derived: grade distribution ── */
  const gradeData = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, Failed: 0 };
    (latestExam?.scores || []).filter(s => !s.isAbsent && s.score !== null).forEach(s => {
      const g = s.grade || "";
      if (g === "A") counts.A++;
      else if (g === "B") counts.B++;
      else if (g === "C") counts.C++;
      else counts.Failed++;
    });
    return [
      { name: "A Grade", value: counts.A,      color: GRADE_COLORS[0] },
      { name: "B Grade", value: counts.B,      color: GRADE_COLORS[1] },
      { name: "C Grade", value: counts.C,      color: GRADE_COLORS[2] },
      { name: "Failed",  value: counts.Failed, color: GRADE_COLORS[3] },
    ].filter(d => d.value > 0);
  }, [latestExam]);

  /* ── derived: failed students by subject ── */
  const failedBySubject = useMemo(() => {
    const map = new Map<string, any[]>();
    (latestExam?.scores || []).filter(s => !s.isAbsent && s.percentage < 50).forEach(s => {
      const subj = (s.subject || s.subjectName || "Unknown").trim();
      if (!map.has(subj)) map.set(subj, []);
      map.get(subj)!.push(s);
    });
    return Array.from(map.entries())
      .map(([subject, students]) => ({ subject, students: students.sort((a, b) => a.percentage - b.percentage) }))
      .sort((a, b) => b.students.length - a.students.length);
  }, [latestExam]);

  /* ── derived: pass rate trend ── */
  const passRateDiff = latestExam && prevExam
    ? latestExam.passRate - prevExam.passRate : null;

  /* ── school topper ── */
  const topper = latestExam?.meritList[0] || null;

  /* ── detail view (desktop only — mobile handles its own detail inside ExamsResultsMobile) ── */
  if (selectedExam && !isMobile) {
    return <ExamDetail exam={selectedExam} allExams={examGroups} onBack={() => setSelectedExam(null)} userData={userData} />;
  }

  /* ── mobile render (dashboard + detail both handled inside ExamsResultsMobile) ── */
  if (isMobile) {
    return (
      <ExamsResultsMobile
        loading={loading}
        upcomingExams={upcomingExams}
        examGroups={examGroups}
        latestExam={latestExam}
        subjectData={subjectData}
        gradeData={gradeData}
        topper={topper}
        selectedExam={selectedExam}
        onSelectExam={exam => setSelectedExam(exam)}
        onBackFromDetail={() => setSelectedExam(null)}
      />
    );
  }

  /* ══ MAIN RENDER ══════════════════════════════════════════════ */
  const dPassTier = !latestExam ? { label: "No data", c: "#CCDDEE", bg: "rgba(153,170,204,.18)", bdr: "rgba(153,170,204,.32)" }
    : latestExam.passRate >= 75 ? { label: "Excellent", c: "#34C759", bg: "rgba(52,199,89,0.22)", bdr: "rgba(52,199,89,0.4)" }
    : latestExam.passRate >= 50 ? { label: "Average", c: "#FFCC00", bg: "rgba(255,204,0,0.22)", bdr: "rgba(255,204,0,0.4)" }
    : { label: "Weak", c: "#FF6961", bg: "rgba(255,59,48,0.22)", bdr: "rgba(255,59,48,0.4)" };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500" style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif" }}>

      {/* Top toolbar */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-normal leading-tight tracking-[-0.7px] flex items-center gap-[12px]" style={{ color: "#1D1D1F" }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0A84FF, #3395FF)", boxShadow: "0 4px 12px rgba(10,132,255,0.32)" }}>
              <FileText className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Exams &amp; Results
          </div>
          <div className="text-[12px] font-normal mt-[8px] ml-[46px] flex items-center gap-[8px]" style={{ color: "#6E6E73" }}>
            <span>Results Analysis</span>
            <span className="font-normal" style={{ color: "#A1A1A6" }}>·</span>
            <span>Subject Performance</span>
            <span className="font-normal" style={{ color: "#A1A1A6" }}>·</span>
            <span>Merit &amp; Fail Lists</span>
          </div>
        </div>
      </div>

      {/* Dark hero banner */}
      <div className="rounded-[22px] px-6 py-5 relative overflow-hidden flex items-center justify-between gap-5 mb-4 cursor-pointer transition-transform active:scale-[0.995] hover:scale-[1.005]"
        onClick={() => latestExam && setSelectedExam(latestExam)}
        style={{
          background: "linear-gradient(135deg, #1D1D1F 0%, #0A84FF 35%, #0A84FF 70%, #0A84FF 100%)",
          boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[12px] min-w-0 relative z-10">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
            <FileText className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-normal uppercase tracking-[0.14em] mb-[4px]" style={{ color: "rgba(255,255,255,0.50)" }}>
              Latest Exam {latestExam?.dateLabel && `· ${latestExam.dateLabel}`}
            </div>
            <div className="text-[28px] font-normal text-white leading-none tracking-[-1px] truncate">
              {loading ? "…" : latestExam?.name || "No exam results yet"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          <div className="flex items-center gap-[4px] px-[16px] py-[8px] rounded-full"
            style={{ background: dPassTier.bg, border: `0.5px solid ${dPassTier.bdr}` }}>
            <span className="text-[12px] font-normal" style={{ color: dPassTier.c }}>{dPassTier.label}</span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: latestExam?.totalStudents ?? "—", label: "Students", color: "#fff" },
              { val: latestExam ? `${latestExam.passRate}%` : "—", label: "Pass Rate", color: "#34C759" },
              { val: latestExam ? `${latestExam.avgPct}%` : "—", label: "Avg %", color: "#FFCC00" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[12px] px-[16px] text-center min-w-[72px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[18px] font-normal leading-none mb-[4px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4 Stat Cards — dashboard-style */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          {
            label: "Latest Exam",
            val: latestExam?.name || "—",
            sub: latestExam?.dateLabel || "No data",
            isText: true,
            Icon: FileText,
            cardGrad: "linear-gradient(135deg, #EBEBF0 0%, #EEF4FF 100%)",
            tileGrad: "linear-gradient(135deg, #0A84FF, #3395FF)",
            tileShadow: "0 4px 14px rgba(10,132,255,0.28)",
            valColor: "#0A84FF",
            decorColor: "#0A84FF",
            onClick: () => latestExam && setSelectedExam(latestExam),
          },
          {
            label: "Students Appeared",
            val: latestExam?.totalStudents ?? "—",
            sub: latestExam ? `${latestExam.scores.filter(s => !s.isAbsent).length} of ${latestExam.scores.length} total` : "—",
            Icon: Users,
            cardGrad: "linear-gradient(135deg, #E5D5FF 0%, #EEF4FF 100%)",
            tileGrad: "linear-gradient(135deg, #AF52DE, #AF52DE)",
            tileShadow: "0 4px 14px rgba(175,82,222,0.26)",
            valColor: "#AF52DE",
            decorColor: "#AF52DE",
          },
          {
            label: "Pass Rate",
            val: latestExam ? `${latestExam.passRate}%` : "—",
            sub: passRateDiff !== null ? `${passRateDiff >= 0 ? "+" : ""}${passRateDiff}% vs prev` : dPassTier.label,
            Icon: Percent,
            cardGrad: "linear-gradient(135deg, #F0F8F1 0%, #F0F8F1 100%)",
            tileGrad: "linear-gradient(135deg, #34C759, #34C759)",
            tileShadow: "0 4px 14px rgba(52,199,89,0.26)",
            valColor: "#248A3D",
            decorColor: "#34C759",
          },
          {
            label: "School Topper",
            val: topper?.name || "—",
            sub: topper ? `${topper.className || ""} · ${topper.avgPct}%` : "No data",
            isText: true,
            Icon: Trophy,
            cardGrad: "linear-gradient(135deg, #FFEFD5 0%, #FFFAEB 100%)",
            tileGrad: "linear-gradient(135deg, #FFCC00, #FFCC00)",
            tileShadow: "0 4px 14px rgba(255,204,0,0.28)",
            valColor: "#FFCC00",
            decorColor: "#FFCC00",
          },
        ].map((s, i) => {
          const Icon = s.Icon;
          return (
            <div
              key={i}
              onClick={s.onClick}
              className={`rounded-[20px] p-5 relative overflow-hidden ${s.onClick ? "cursor-pointer transition-transform active:scale-[0.98] hover:-translate-y-[1px]" : ""}`}
              style={{
                background: s.cardGrad,
                boxShadow: "0 0 0 0.5px rgba(10,132,255,0.14), 0 6px 20px rgba(10,132,255,0.10), 0 22px 56px rgba(10,132,255,0.10)",
                border: "0.5px solid rgba(10,132,255,0.08)",
              }}
            >
              <div
                className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
                style={{ background: s.tileGrad, boxShadow: s.tileShadow }}
              >
                <Icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
              </div>
              <span className="block text-[12px] font-normal uppercase tracking-[0.10em] mb-1.5" style={{ color: "#A1A1A6" }}>{s.label}</span>
              {s.isText ? (
                <p className="text-[20px] font-normal tracking-tight leading-tight mb-1.5 truncate" style={{ color: s.valColor, letterSpacing: "-0.5px" }}>{s.val}</p>
              ) : (
                <p className="text-[28px] font-normal tracking-tight leading-none mb-1.5" style={{ color: s.valColor, letterSpacing: "-1.2px" }}>{s.val}</p>
              )}
              <p className="text-[12px] font-normal truncate flex items-center gap-1" style={{ color: i === 2 && passRateDiff !== null ? (passRateDiff >= 0 ? "#248A3D" : "#FF3B30") : "#6E6E73" }}>
                {i === 2 && passRateDiff !== null && (passRateDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                {s.sub}
              </p>
              <Icon
                className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                style={{ color: s.decorColor, opacity: 0.18 }}
                strokeWidth={2}
              />
            </div>
          );
        })}
      </div>

      {/* Upcoming exams section */}
      <div className="flex items-center gap-2 text-[12px] font-normal uppercase tracking-[0.12em] mb-3" style={{ color: "#A1A1A6" }}>
        Upcoming Exams
        <span className="px-[12px] py-[4px] rounded-full text-[12px] font-normal ml-1"
          style={{ background: "rgba(10,132,255,0.10)", color: "#0A84FF", border: "0.5px solid rgba(10,132,255,0.16)" }}>
          {upcomingExams.length} scheduled
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
      </div>

      <div className="rounded-[22px] bg-white p-5 mb-5"
        style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#0A84FF" }} /></div>
        ) : upcomingExams.length === 0 ? (
          <div className="flex items-center gap-3 py-4 px-2">
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(10,132,255,0.08)", border: "0.5px solid rgba(10,132,255,0.14)" }}>
              <Calendar className="w-[18px] h-[18px]" style={{ color: "rgba(10,132,255,0.45)" }} strokeWidth={2} />
            </div>
            <div>
              <p className="text-[13px] font-normal" style={{ color: "#1D1D1F" }}>No upcoming exams scheduled</p>
              <p className="text-[12px] mt-1" style={{ color: "#A1A1A6" }}>Teachers can create exams from the Teacher Dashboard.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {upcomingExams.slice(0, 6).map((exam, i) => {
              const color = BORDER_COLORS[i % BORDER_COLORS.length];
              const dateStr = fmtDate(exam.testDate || exam.date || "");
              return (
                <div key={exam.id} className="rounded-[14px] px-4 py-3 relative overflow-hidden transition-transform active:scale-[0.98] hover:scale-[1.02]"
                  style={{ background: "#EEF4FF", border: "0.5px solid rgba(10,132,255,0.10)", borderLeftWidth: "4px", borderLeftColor: color }}>
                  <p className="text-[13px] font-normal truncate" style={{ color: "#1D1D1F" }}>{exam.title || exam.testName}</p>
                  <p className="text-[12px] mt-1 flex items-center gap-1" style={{ color: "#6E6E73" }}>
                    <Calendar className="w-3 h-3" strokeWidth={2.3} /> {dateStr || "Date TBD"}
                  </p>
                  <p className="text-[12px] font-normal mt-[2px]" style={{ color: "#A1A1A6" }}>
                    {exam.className ? `Class ${exam.className}` : exam.subject || ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Analytics section label */}
      <div className="flex items-center gap-2 text-[12px] font-normal uppercase tracking-[0.12em] mb-3" style={{ color: "#A1A1A6" }}>
        Analytics
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {/* Subject-wise Pass Rates */}
        <div className="rounded-[22px] bg-white p-5"
          style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[14px] font-normal tracking-[-0.2px]" style={{ color: "#1D1D1F" }}>Subject-wise Pass Rates</div>
            <span className="px-[8px] py-[4px] rounded-full text-[12px] font-normal"
              style={{ background: "rgba(10,132,255,0.10)", color: "#0A84FF", border: "0.5px solid rgba(10,132,255,0.16)" }}>
              {subjectData.length} subjects
            </span>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#0A84FF" }} /></div>
          ) : subjectData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="w-10 h-10 mb-2" style={{ color: "rgba(10,132,255,0.20)" }} strokeWidth={1.8} />
              <p className="text-[12px] font-normal" style={{ color: "#A1A1A6" }}>No subject data yet</p>
            </div>
          ) : (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EBEBF0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "#6E6E73", fontWeight: 400 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false}
                    tick={{ fontSize: 11, fill: "#A1A1A6" }} domain={[0, 100]} />
                  <RechartsTip
                    formatter={(v: any) => [`${v}%`, "Pass Rate"]}
                    contentStyle={{ borderRadius: "10px", border: "0.5px solid rgba(10,132,255,0.14)", fontSize: 12, fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif", boxShadow: "0 4px 16px rgba(10,132,255,0.12)" }}
                  />
                  <Bar dataKey="passRate" radius={[6, 6, 0, 0]} maxBarSize={52} label={{ position: "top", fontSize: 11, fontWeight: 400, fill: "#1D1D1F", formatter: (v: any) => `${v}%` }}>
                    {subjectData.map((d, i) => (
                      <Cell key={i} fill={d.passRate >= 80 ? "#34C759" : d.passRate >= 60 ? "#FF9500" : "#FF3B30"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Grade Distribution */}
        <div className="rounded-[22px] bg-white p-5"
          style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-[14px] font-normal tracking-[-0.2px]" style={{ color: "#1D1D1F" }}>Grade Distribution</div>
            <span className="px-[8px] py-[4px] rounded-full text-[12px] font-normal"
              style={{ background: "rgba(10,132,255,0.10)", color: "#0A84FF", border: "0.5px solid rgba(10,132,255,0.16)" }}>
              Latest exam
            </span>
          </div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "#0A84FF" }} /></div>
          ) : gradeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <FileText className="w-10 h-10 mb-2" style={{ color: "rgba(10,132,255,0.20)" }} strokeWidth={1.8} />
              <p className="text-[12px] font-normal" style={{ color: "#A1A1A6" }}>No grade data yet</p>
            </div>
          ) : (() => {
            const slugify = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "g";
            const chartData = gradeData.map((d, i) => ({
              key: `${slugify(d.name)}-${i}`,
              name: d.name,
              value: d.value,
              fill: d.color,
            }));
            const chartConfig: ChartConfig = {
              value: { label: "Students" },
              ...Object.fromEntries(chartData.map(d => [d.key, { label: d.name, color: d.fill }])),
            };
            return (
              <>
                <ChartContainer
                  config={chartConfig}
                  className="mx-auto aspect-square max-h-[260px] px-0"
                >
                  <PieChart>
                    <ChartTooltip
                      content={<ChartTooltipContent nameKey="value" hideLabel formatter={(v: any, n: any) => [`${v} students`, n]} />}
                    />
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="key"
                      animationDuration={1000}
                      labelLine={false}
                      label={({ payload, ...props }: any) => {
                        if (!payload?.value) return null;
                        return (
                          <text
                            cx={props.cx}
                            cy={props.cy}
                            x={props.x}
                            y={props.y}
                            textAnchor={props.textAnchor}
                            dominantBaseline={props.dominantBaseline}
                            fill="#ffffff"
                            style={{ fontSize: 14, fontWeight: 400, fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif" }}
                          >
                            {payload.value}
                          </text>
                        );
                      }}
                    />
                  </PieChart>
                </ChartContainer>
                <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mt-3">
                  {gradeData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                      <span className="text-[12px] font-normal" style={{ color: "#6E6E73", fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif" }}>{d.name}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {/* Failed students by subject */}
      {!loading && failedBySubject.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-[12px] font-normal uppercase tracking-[0.12em] mb-3" style={{ color: "#A1A1A6" }}>
            Failed Students by Subject
            {latestExam && (
              <span className="px-[12px] py-[4px] rounded-full text-[12px] font-normal ml-1"
                style={{ background: "rgba(255,59,48,0.10)", color: "#FF3B30", border: "0.5px solid rgba(255,59,48,0.22)" }}>
                {latestExam.name}
              </span>
            )}
            <div className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
          </div>
          <div className="grid grid-cols-4 gap-4 mb-5">
            {failedBySubject.slice(0, 4).map(({ subject, students }) => (
              <div key={subject} className="rounded-[18px] bg-white overflow-hidden"
                style={{ boxShadow: "0 0 0 .5px rgba(255,59,48,.08), 0 4px 16px rgba(255,59,48,.09), 0 16px 40px rgba(255,59,48,.12)", border: "0.5px solid rgba(255,59,48,0.18)" }}>
                <div className="flex items-center justify-between px-4 py-[12px]"
                  style={{ background: "linear-gradient(135deg, rgba(255,59,48,0.08), rgba(255,59,48,0.04))", borderBottom: "0.5px solid rgba(255,59,48,0.14)" }}>
                  <div className="flex items-center gap-[8px]">
                    <AlertTriangle className="w-[13px] h-[13px]" style={{ color: "#FF3B30" }} strokeWidth={2.4} />
                    <span className="text-[12px] font-normal uppercase tracking-[0.05em]" style={{ color: "#86170E" }}>{subject}</span>
                  </div>
                  <span className="px-[8px] py-[2px] rounded-full text-[12px] font-normal"
                    style={{ background: "rgba(255,59,48,0.12)", color: "#FF3B30", border: "0.5px solid rgba(255,59,48,0.22)" }}>
                    {students.length} failed
                  </span>
                </div>
                <div>
                  {students.slice(0, 5).map((s: any, i: number, arr: any[]) => (
                    <div key={i} className="flex items-center justify-between px-4 py-[12px]"
                      style={i < Math.min(arr.length, 5) - 1 ? { borderBottom: "0.5px solid rgba(255,59,48,0.05)" } : {}}>
                      <div className="flex items-center gap-[8px] min-w-0">
                        <div className="w-7 h-7 rounded-[9px] flex items-center justify-center text-white text-[12px] font-normal shrink-0"
                          style={{ background: "linear-gradient(135deg, #FF3B30, #FF5E55)", boxShadow: "0 2px 6px rgba(255,59,48,0.22)" }}>
                          {s.studentName?.substring(0, 2).toUpperCase()}
                        </div>
                        <p className="text-[12px] font-normal truncate" style={{ color: "#1D1D1F" }}>{s.studentName}</p>
                      </div>
                      <span className="text-[12px] font-normal shrink-0 ml-2" style={{ color: "#FF3B30" }}>{Math.round(s.percentage)}%</span>
                    </div>
                  ))}
                  {students.length > 5 && (
                    <p className="px-4 py-[8px] text-[12px] font-normal" style={{ color: "#A1A1A6" }}>+{students.length - 5} more</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* All exams */}
      {!loading && examGroups.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-[12px] font-normal uppercase tracking-[0.12em] mb-3" style={{ color: "#A1A1A6" }}>
            All Exams
            <span className="px-[12px] py-[4px] rounded-full text-[12px] font-normal ml-1"
              style={{ background: "rgba(10,132,255,0.10)", color: "#0A84FF", border: "0.5px solid rgba(10,132,255,0.16)" }}>
              {examGroups.length} {examGroups.length === 1 ? "exam" : "exams"}
            </span>
            <div className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
          </div>
          <div className="rounded-[22px] bg-white overflow-hidden"
            style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr style={{ background: "rgba(10,132,255,0.04)", borderBottom: "0.5px solid rgba(10,132,255,0.07)" }}>
                    {["Exam Name", "Date", "Students", "Pass Rate", "Avg %", ""].map(h => (
                      <th key={h} className="px-6 py-[16px] text-left text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: "#A1A1A6" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {examGroups.map((exam, i, arr) => {
                    const passColor = exam.passRate >= 75 ? "#34C759" : exam.passRate >= 50 ? "#FF9500" : "#FF3B30";
                    const avgColor = exam.avgPct >= 70 ? "#34C759" : exam.avgPct >= 50 ? "#FF9500" : "#FF3B30";
                    return (
                      <tr key={i} className="transition-colors hover:bg-[#EEF4FF]"
                        style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(10,132,255,0.05)" } : {}}>
                        <td className="px-6 py-[16px]">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0"
                              style={{ background: "linear-gradient(135deg, #0A84FF, #3395FF)", boxShadow: "0 3px 10px rgba(10,132,255,0.28)" }}>
                              <FileText className="w-[16px] h-[16px] text-white" strokeWidth={2.3} />
                            </div>
                            <span className="text-[13px] font-normal tracking-[-0.2px] capitalize" style={{ color: "#1D1D1F" }}>{exam.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-[16px] text-[12px] font-normal" style={{ color: "#6E6E73" }}>{exam.dateLabel || "—"}</td>
                        <td className="px-6 py-[16px] text-[13px] font-normal" style={{ color: "#1D1D1F" }}>{exam.totalStudents}</td>
                        <td className="px-6 py-[16px]">
                          <span className="px-[12px] py-[4px] rounded-full text-[12px] font-normal"
                            style={{ background: `${passColor}15`, color: passColor, border: `0.5px solid ${passColor}35` }}>
                            {exam.passRate}%
                          </span>
                        </td>
                        <td className="px-6 py-[16px]">
                          <span className="text-[13px] font-normal" style={{ color: avgColor }}>{exam.avgPct}%</span>
                        </td>
                        <td className="px-6 py-[16px]">
                          <button onClick={() => setSelectedExam(exam)}
                            className="h-9 px-4 rounded-[11px] flex items-center gap-[4px] text-[12px] font-normal text-white transition-transform active:scale-95 hover:scale-[1.03] relative overflow-hidden whitespace-nowrap"
                            style={{ background: "linear-gradient(135deg, #0A84FF, #3395FF)", boxShadow: "0 3px 10px rgba(10,132,255,0.26)" }}>
                            <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                            <span className="relative z-10">View Results</span>
                            <ChevronRight className="w-3 h-3 relative z-10" strokeWidth={2.5} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && examGroups.length === 0 && (
        <div className="rounded-[22px] py-10 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <div className="w-16 h-16 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(10,132,255,0.08)", border: "0.5px solid rgba(10,132,255,0.14)" }}>
            <FileText className="w-7 h-7" style={{ color: "rgba(10,132,255,0.45)" }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-normal mb-1" style={{ color: "#1D1D1F" }}>No exam results yet</p>
          <p className="text-[12px]" style={{ color: "#A1A1A6" }}>Teachers submit scores via Teacher Dashboard → Tests &amp; Exams.</p>
        </div>
      )}
    </div>
  );
}
