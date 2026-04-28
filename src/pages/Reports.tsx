import { useState, useEffect } from "react";
import {
  FileText, Download, GraduationCap, Calendar, Shield, IndianRupee,
  Settings, UserCheck, Layout, CalendarCheck, AlertTriangle, Trophy,
  Users2, MessageSquare, LineChart, Trash2, ArrowRight, Plus, Loader2, Clock,
  BarChart3,
} from "lucide-react";
import GenerateReport from "@/components/GenerateReport";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot,
  deleteDoc, doc
} from "firebase/firestore";
import { toast } from "sonner";

type CategoryId = "academic" | "attendance" | "discipline" | "financial" | "custom";

const reportCategories: {
  id: CategoryId; label: string; count: string; icon: any; tone: "blue" | "green" | "red" | "orange" | "violet";
}[] = [
  { id: "academic",    label: "Academic",    count: "12 templates",    icon: GraduationCap, tone: "blue" },
  { id: "attendance",  label: "Attendance",  count: "8 templates",     icon: CalendarCheck, tone: "green" },
  { id: "discipline",  label: "Discipline",  count: "5 templates",     icon: Shield,        tone: "red" },
  { id: "financial",   label: "Financial",   count: "6 templates",     icon: IndianRupee,   tone: "orange" },
  { id: "custom",      label: "Custom",      count: "Build your own",  icon: Settings,      tone: "violet" },
];

const templates = [
  { title: "Student Progress",     desc: "Individual performance",  icon: UserCheck,     tone: "violet" },
  { title: "Class Performance",    desc: "Section-wise analysis",   icon: Layout,        tone: "blue" },
  { title: "Monthly Attendance",   desc: "Attendance summary",      icon: CalendarCheck, tone: "green" },
  { title: "Risk Students",        desc: "At-risk student list",    icon: AlertTriangle, tone: "red" },
  { title: "Exam Results",         desc: "Comprehensive report",    icon: Trophy,        tone: "gold" },
  { title: "Teacher Performance",  desc: "Staff evaluation",        icon: Users2,        tone: "blue" },
  { title: "Parent Communication", desc: "Communication log",       icon: MessageSquare, tone: "green" },
  { title: "School Overview",      desc: "Complete analytics",      icon: LineChart,     tone: "orange" },
];

// ═══════════════════════════════════════════════════════════════════════
// MOCK DATA — flip USE_MOCK_DATA to false to restore live Firestore data
// ═══════════════════════════════════════════════════════════════════════
const USE_MOCK_DATA_RP = true;

const _rpTs = (daysAgo: number, h = 12) => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, 0, 0, 0);
  return { toMillis: () => d.getTime(), toDate: () => d, seconds: Math.floor(d.getTime() / 1000) };
};

// 8 recent generated reports
const MOCK_RECENT_REPORTS: any[] = [
  {
    id: "rep-1", title: "Term 2 Mid-Term Performance — School-wide",
    type: "Academic", format: "PDF", status: "Published", className: "All Grades",
    generatedBy: "Dr. Vikram Sharma",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(2, 14),
    data: { totalStudents: 487, avgAttendance: 92, avgMarks: 78, atRisk: 12, incidents: 5, passRate: 88, fullList: [] },
  },
  {
    id: "rep-2", title: "Risk Students Intervention Report — Week 17",
    type: "Risk", format: "PDF", status: "Published", className: "Multiple",
    generatedBy: "Dr. Vikram Sharma",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(4, 11),
    data: { totalStudents: 12, avgAttendance: 64, avgMarks: 52, atRisk: 12, incidents: 3, passRate: 42 },
  },
  {
    id: "rep-3", title: "Grade 8B — Class Performance Snapshot",
    type: "Class Report", format: "Excel", status: "Published", className: "Grade 8B",
    generatedBy: "Mrs. Priya Mehta",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(7, 16),
    data: { totalStudents: 31, avgAttendance: 94, avgMarks: 84, atRisk: 0, incidents: 0, passRate: 100 },
  },
  {
    id: "rep-4", title: "Monthly Attendance Report — March 2026",
    type: "Attendance", format: "PDF", status: "Published", className: "All Grades",
    generatedBy: "Front Office",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(15, 9),
    data: { totalStudents: 487, avgAttendance: 89, avgMarks: 0, atRisk: 18, incidents: 0, passRate: 0 },
  },
  {
    id: "rep-5", title: "Discipline & Incidents Summary — Q1 FY26",
    type: "Discipline", format: "PDF", status: "Published", className: "All Grades",
    generatedBy: "Dr. Vikram Sharma",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(22, 15),
    data: { totalStudents: 487, avgAttendance: 0, avgMarks: 0, atRisk: 5, incidents: 11, passRate: 0 },
  },
  {
    id: "rep-6", title: "Teacher Performance Review — Term 1",
    type: "Teacher", format: "PDF", status: "Published", className: "Faculty",
    generatedBy: "Dr. Vikram Sharma",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(30, 10),
    data: { totalStudents: 17, avgAttendance: 96, avgMarks: 78, atRisk: 0, incidents: 0, passRate: 0 },
  },
  {
    id: "rep-7", title: "Fee Collection Status — Term 2",
    type: "Finance", format: "Excel", status: "Published", className: "All Grades",
    generatedBy: "Mr. Arvind Saluja (Fee Officer)",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(40, 12),
    data: { totalStudents: 487, avgAttendance: 0, avgMarks: 0, atRisk: 5, incidents: 0, passRate: 0 },
  },
  {
    id: "rep-8", title: "Parent–Teacher Meeting Summary — March 2026",
    type: "Communication", format: "PDF", status: "Published", className: "All Grades",
    generatedBy: "Dr. Vikram Sharma",
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    createdAt: _rpTs(50, 14),
    data: { totalStudents: 487, avgAttendance: 0, avgMarks: 0, atRisk: 0, incidents: 0, passRate: 0 },
  },
];

const Reports = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const [activeCategory,    setActiveCategory]    = useState<CategoryId>("academic");
  const [selectedTemplate,  setSelectedTemplate]  = useState<string | null>(null);
  const [recentReports,     setRecentReports]     = useState<any[]>(USE_MOCK_DATA_RP ? MOCK_RECENT_REPORTS : []);
  const [isLoading,         setIsLoading]         = useState(USE_MOCK_DATA_RP ? false : true);
  const [deletingId,        setDeletingId]        = useState<string | null>(null);

  /* ── listen for principal's generated reports ── */
  useEffect(() => {
    if (USE_MOCK_DATA_RP) return; // Mock mode: recentReports pre-seeded above
    if (!userData?.schoolId) return;
    const reportConstraints: any[] = [where("schoolId", "==", userData.schoolId)];
    if (userData.branchId) reportConstraints.push(where("branchId", "==", userData.branchId));
    const q = query(collection(db, "principal_reports"), ...reportConstraints);
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setRecentReports(docs.slice(0, 10));
      setIsLoading(false);
    }, err => {
      console.error(err);
      setIsLoading(false);
    });
    return () => unsub();
  }, [userData?.schoolId, userData?.branchId]);

  /* ── delete a report ── */
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "principal_reports", id));
      toast.success("Report deleted.");
    } catch {
      toast.error("Failed to delete. Try again.");
    }
    setDeletingId(null);
  };

  /* ── download: open print view (professional template) ── */
  const handleDownload = (report: any) => {
    const { buildReport, openReportWindow } = require("@/lib/reportTemplate");
    const d = report.data || {};
    const html = buildReport({
      title: report.title || "Report",
      subtitle: `Generated by ${report.generatedBy || "Principal"} · ${report.format || "PDF"} Format`,
      badge: report.className || report.grade || "",
      schoolName: userData?.schoolName || "Edullent",
      generatedBy: userData?.name || "Principal",
      heroStats: [
        { label: "Total Students", value: d.totalStudents ?? "—" },
        { label: "Avg Attendance", value: `${d.avgAttendance ?? 0}%`, color: (d.avgAttendance ?? 0) >= 85 ? "#34C759" : "#FFCC00" },
        { label: "Avg Marks", value: `${d.avgMarks ?? 0}%`, color: (d.avgMarks ?? 0) >= 75 ? "#34C759" : "#FFCC00" },
        { label: "At-Risk", value: d.atRisk ?? "—", color: (d.atRisk ?? 0) > 0 ? "#f87171" : "#34C759" },
      ],
      sections: [
        {
          title: "Performance Overview",
          type: "bars",
          bars: [
            { label: "Average Attendance", value: d.avgAttendance ?? 0 },
            { label: "Average Marks", value: d.avgMarks ?? 0 },
            { label: "Pass Rate", value: d.passRate ?? 0 },
          ],
        },
        {
          title: "Key Metrics",
          type: "stats",
          stats: [
            { label: "Total Students", value: d.totalStudents ?? "—" },
            { label: "At-Risk Students", value: d.atRisk ?? "0", color: "#FF3B30" },
            { label: "Discipline Incidents", value: d.incidents ?? "0" },
            { label: "Report Type", value: report.type || "General" },
            { label: "Status", value: report.status || "Draft" },
          ],
        },
        ...(d.fullList?.length > 0 ? [{
          title: "Student Breakdown",
          type: "table" as const,
          headers: ["Name", "Score", "Attendance", "Standing"],
          rows: (d.fullList || []).slice(0, 30).map((s: any) => ({
            cells: [s.name || s.studentName || "—", `${s.score || s.avgScore || 0}%`, `${s.attendance || s.attendanceRate || 0}%`, s.standing || "—"],
            highlight: (s.score || s.avgScore || 0) < 40,
          })),
        }] : []),
        ...(d.aiRemarks ? [{ title: "AI Remarks", type: "text" as const, text: d.aiRemarks }] : []),
      ],
    });
    openReportWindow(html);
  };

  /* ── if generate view open ── */
  if (selectedTemplate) {
    return (
      <GenerateReport
        templateName={selectedTemplate}
        onBack={() => setSelectedTemplate(null)}
      />
    );
  }

  // Design tokens
  const B1 = "#0A84FF", B2 = "#3395FF", B4 = "#7CBBFF";
  const BG = "#EEF4FF";
  const T1 = "#1D1D1F", T2 = "#3A3A3C", T3 = "#6E6E73", T4 = "#A1A1A6";
  const SEP = "rgba(10,132,255,0.08)";
  const GREEN = "#34C759", GREEN_D = "#248A3D", GREEN_S = "rgba(52,199,89,0.10)", GREEN_B = "rgba(52,199,89,0.22)";
  const RED = "#FF3B30", RED_S = "rgba(255,59,48,0.10)", RED_B = "rgba(255,59,48,0.22)";
  const ORANGE = "#FF9500", ORANGE_S = "rgba(255,149,0,0.10)", ORANGE_B = "rgba(255,149,0,0.22)";
  const GOLD = "#FFCC00", GOLD_S = "rgba(255,204,0,0.10)", GOLD_B = "rgba(255,204,0,0.22)";
  const VIOLET = "#AF52DE", VIOLET_S = "rgba(175,82,222,0.10)", VIOLET_B = "rgba(175,82,222,0.22)";
  const SH = "0 0 0 0.5px rgba(10,132,255,0.08), 0 2px 10px rgba(10,132,255,0.07), 0 10px 28px rgba(10,132,255,0.09)";
  const SH_LG = "0 0 0 0.5px rgba(10,132,255,0.10), 0 4px 16px rgba(10,132,255,0.10), 0 18px 44px rgba(10,132,255,0.12)";
  const SH_BTN = "0 6px 22px rgba(10,132,255,0.38), 0 2px 5px rgba(10,132,255,0.18)";

  const toneStyles = {
    blue:   { card: "linear-gradient(135deg,#DDEAFF 0%,#A8C5FF 55%,#7AA5FF 100%)", border: "rgba(10,132,255,.40)", nameColor: "#001055", countColor: "#3A3A3C", iconColor: "#001055" },
    green:  { card: "linear-gradient(135deg,#DEFCE8 0%,#8CF0B0 55%,#50E088 100%)", border: "rgba(52,199,89,.40)", nameColor: "#004018", countColor: "#005A20", iconColor: "#004018" },
    red:    { card: "linear-gradient(135deg,#FFE3E8 0%,#FFA8B8 55%,#FF7085 100%)", border: "rgba(255,59,48,.40)", nameColor: "#60081A", countColor: "#8A0A22", iconColor: "#60081A" },
    orange: { card: "linear-gradient(135deg,#FFEED1 0%,#FFCC77 55%,#FF9500 100%)", border: "rgba(255,149,0,.40)", nameColor: "#472200", countColor: "#86310C", iconColor: "#472200" },
    violet: { card: "linear-gradient(135deg,#EEE0FF 0%,#C9A8FF 55%,#A880FF 100%)", border: "rgba(175,82,222,.40)", nameColor: "#280C5C", countColor: "#3A1580", iconColor: "#280C5C" },
  } as const;

  // Shared category-card palette so mobile + desktop render with the same vibe.
  // Bright accent name color (with green darkened for legibility on pale green).
  const categoryPalette: Record<string, { cardGrad: string; tileGrad: string; tileShadow: string; nameColor: string; decorColor: string; ringColor: string }> = {
    blue: {
      cardGrad: "linear-gradient(135deg, #EBEBF0 0%, #EEF4FF 100%)",
      tileGrad: `linear-gradient(135deg, ${B1}, ${B2})`,
      tileShadow: "0 4px 14px rgba(10,132,255,0.28)",
      nameColor: B1,
      decorColor: B1,
      ringColor: "rgba(10,132,255,0.42)",
    },
    green: {
      cardGrad: "linear-gradient(135deg, #F0F8F1 0%, #F0F8F1 100%)",
      tileGrad: `linear-gradient(135deg, ${GREEN}, #34C759)`,
      tileShadow: "0 4px 14px rgba(52,199,89,0.26)",
      nameColor: GREEN_D,
      decorColor: GREEN,
      ringColor: "rgba(52,199,89,0.42)",
    },
    red: {
      cardGrad: "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)",
      tileGrad: `linear-gradient(135deg, ${RED}, #FF5E55)`,
      tileShadow: "0 4px 14px rgba(255,59,48,0.28)",
      nameColor: RED,
      decorColor: RED,
      ringColor: "rgba(255,59,48,0.42)",
    },
    orange: {
      cardGrad: "linear-gradient(135deg, #FFEFD5 0%, #FFFAEB 100%)",
      tileGrad: `linear-gradient(135deg, ${GOLD}, #FFCC00)`,
      tileShadow: "0 4px 14px rgba(255,204,0,0.28)",
      nameColor: GOLD,
      decorColor: GOLD,
      ringColor: "rgba(255,204,0,0.42)",
    },
    violet: {
      cardGrad: "linear-gradient(135deg, #E5D5FF 0%, #EEF4FF 100%)",
      tileGrad: `linear-gradient(135deg, ${VIOLET}, #AF52DE)`,
      tileShadow: "0 4px 14px rgba(175,82,222,0.26)",
      nameColor: VIOLET,
      decorColor: VIOLET,
      ringColor: "rgba(175,82,222,0.42)",
    },
  };

  const templateToneGrad = (tone: string) => {
    if (tone === "blue")   return { bg: "rgba(10,132,255,0.10)", border: "rgba(10,132,255,0.22)", color: B1 };
    if (tone === "green")  return { bg: GREEN_S, border: GREEN_B, color: GREEN };
    if (tone === "red")    return { bg: RED_S, border: RED_B, color: RED };
    if (tone === "orange") return { bg: ORANGE_S, border: ORANGE_B, color: ORANGE };
    if (tone === "violet") return { bg: VIOLET_S, border: VIOLET_B, color: VIOLET };
    if (tone === "gold")   return { bg: GOLD_S, border: GOLD_B, color: GOLD };
    return { bg: "rgba(10,132,255,0.10)", border: "rgba(10,132,255,0.22)", color: B1 };
  };

  // Dashboard-mobile card vibe per tone — pastel gradient bg + bold brand-gradient
  // icon tile + tinted name color for legibility on the pastel.
  const vibeFor = (tone: string) => {
    switch (tone) {
      case "blue":
        return {
          cardBg: "linear-gradient(135deg, #EBEBF0 0%, #EEF4FF 100%)",
          iconBg: `linear-gradient(135deg, ${B1}, ${B2})`,
          iconShadow: "0 4px 14px rgba(10,132,255,0.28)",
          accent: B1, nameColor: "#001055", subColor: T3,
        };
      case "green":
        return {
          cardBg: "linear-gradient(135deg, #F0F8F1 0%, #F0F8F1 100%)",
          iconBg: `linear-gradient(135deg, ${GREEN}, #34C759)`,
          iconShadow: "0 4px 14px rgba(52,199,89,0.26)",
          accent: GREEN, nameColor: GREEN_D, subColor: GREEN_D,
        };
      case "red":
        return {
          cardBg: "linear-gradient(135deg, #F5CFD7 0%, #FDF3F5 100%)",
          iconBg: `linear-gradient(135deg, ${RED}, #FF5E55)`,
          iconShadow: "0 4px 14px rgba(255,59,48,0.28)",
          accent: RED, nameColor: "#8A0A22", subColor: "#8A0A22",
        };
      case "orange":
        return {
          cardBg: "linear-gradient(135deg, #FBDDC4 0%, #FEF3EB 100%)",
          iconBg: `linear-gradient(135deg, ${ORANGE}, #FFB044)`,
          iconShadow: "0 4px 14px rgba(255,149,0,0.28)",
          accent: ORANGE, nameColor: "#86310C", subColor: "#86310C",
        };
      case "violet":
        return {
          cardBg: "linear-gradient(135deg, #E5D5FF 0%, #EEF4FF 100%)",
          iconBg: `linear-gradient(135deg, ${VIOLET}, #AF52DE)`,
          iconShadow: "0 4px 14px rgba(175,82,222,0.26)",
          accent: VIOLET, nameColor: "#280C5C", subColor: "#280C5C",
        };
      case "gold":
        return {
          cardBg: "linear-gradient(135deg, #FFEFD5 0%, #FFFAEB 100%)",
          iconBg: `linear-gradient(135deg, ${GOLD}, #FFCC00)`,
          iconShadow: "0 4px 14px rgba(255,204,0,0.28)",
          accent: GOLD, nameColor: "#A86A00", subColor: "#A86A00",
        };
      default:
        return {
          cardBg: "linear-gradient(135deg, #EBEBF0 0%, #EEF4FF 100%)",
          iconBg: `linear-gradient(135deg, ${B1}, ${B2})`,
          iconShadow: "0 4px 14px rgba(10,132,255,0.28)",
          accent: B1, nameColor: "#001055", subColor: T3,
        };
    }
  };

  const totalTemplates = 36;
  const categoriesCount = 5;
  const preBuiltCount = templates.length;

  // ═══════════════════════════════════════════════════════════════
  //  MOBILE
  // ═══════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif", background: BG, minHeight: "100vh" }}>

        {/* Page head */}
        <div className="px-5 pt-4 flex items-center gap-3">
          <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 12px rgba(10,132,255,0.32)" }}>
            <FileText className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[22px] font-normal leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>Reports</div>
            <div className="text-[12px] mt-1" style={{ color: T3 }}>Generate and manage school reports</div>
          </div>
        </div>

        {/* Hero */}
        <div className="mx-5 mt-[16px] rounded-[22px] px-[16px] py-4 relative overflow-hidden text-white"
          style={{
            background: "linear-gradient(135deg, #1D1D1F 0%, #0A84FF 35%, #0A84FF 70%, #0A84FF 100%)",
            boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
          }}>
          <div className="absolute -top-9 -right-6 w-[150px] h-[150px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
          <div className="flex items-center justify-between mb-[16px] relative z-10">
            <div className="flex items-center gap-[12px]">
              <div className="w-9 h-9 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
                <BarChart3 className="w-[18px] h-[18px] text-white" strokeWidth={2.1} />
              </div>
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.12em] mb-[4px]" style={{ color: "rgba(255,255,255,0.50)" }}>Available Reports</div>
                <div className="text-[28px] font-normal leading-none" style={{ letterSpacing: "-0.8px" }}>{totalTemplates} Templates</div>
              </div>
            </div>
            <div className="flex items-center gap-[4px] px-3 py-[4px] rounded-full text-[12px] font-normal"
              style={{ background: "rgba(52,199,89,0.22)", border: "0.5px solid rgba(52,199,89,0.40)", color: "#66FFAA" }}>
              <div className="w-[6px] h-[6px] rounded-full" style={{ background: "#66FFAA", boxShadow: "0 0 8px rgba(102,255,170,0.8)" }} />
              Ready
            </div>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: categoriesCount, lbl: "Categories", color: "#fff" },
              { val: preBuiltCount,   lbl: "Pre-built",  color: "#FFCC00" },
              { val: recentReports.length, lbl: "Generated", color: "#34C759" },
            ].map(x => (
              <div key={x.lbl} className="text-center py-[12px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[16px] font-normal leading-none mb-[4px]" style={{ color: x.color, letterSpacing: "-0.3px" }}>{x.val}</div>
                <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{x.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category cards */}
        <div className="grid grid-cols-2 gap-[12px] px-5 pt-[16px]">
          {reportCategories.map(cat => {
            const v = vibeFor(cat.tone);
            const active = activeCategory === cat.id;
            const isCustom = cat.id === "custom";
            const Icon = cat.icon;
            return (
              <button key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`${isCustom ? "col-span-2" : ""} rounded-[20px] p-4 relative overflow-hidden active:scale-[0.96] transition-transform text-left min-h-[110px]`}
                style={{
                  background: v.cardBg,
                  border: active ? `1.5px solid ${v.accent}` : "0.5px solid rgba(10,132,255,0.10)",
                  boxShadow: active
                    ? `0 0 0 3px ${v.accent}22, 0 8px 22px rgba(0,0,0,0.10)`
                    : SH_LG,
                  transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                <div className="w-[44px] h-[44px] rounded-[12px] flex items-center justify-center mb-[12px] relative z-10"
                  style={{ background: v.iconBg, boxShadow: v.iconShadow }}>
                  <Icon className="w-[22px] h-[22px] text-white" strokeWidth={2.3} />
                </div>
                <div className="relative z-10">
                  <div className="text-[14px] font-normal leading-[1.15] mb-[4px]" style={{ color: v.nameColor, letterSpacing: "-0.2px" }}>
                    {cat.label}{isCustom ? " · Build your own" : ""}
                  </div>
                  <div className="text-[12px] font-normal" style={{ color: v.subColor }}>{cat.count}</div>
                </div>
                <Icon className="absolute bottom-[12px] right-[12px] w-12 h-12 pointer-events-none"
                  style={{ color: v.accent, opacity: 0.18 }} strokeWidth={2} />
              </button>
            );
          })}
        </div>

        {/* Pre-built label */}
        <div className="flex items-center gap-2 px-5 pt-4 text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: T4 }}>
          <span>Pre-built Templates</span>
          <span className="px-[8px] py-[4px] rounded-full ml-1" style={{ background: "rgba(10,132,255,0.10)", border: "0.5px solid rgba(10,132,255,0.16)", color: B1 }}>
            {preBuiltCount} quick picks
          </span>
          <span className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
        </div>

        {/* Templates grid 2-col */}
        <div className="grid grid-cols-2 gap-[12px] px-5 pt-3">
          {templates.map((tpl, i) => {
            const v = vibeFor(tpl.tone);
            const Icon = tpl.icon;
            return (
              <button key={i}
                onClick={() => setSelectedTemplate(tpl.title)}
                className="rounded-[18px] p-[16px] active:scale-[0.97] transition-transform text-left relative overflow-hidden min-h-[100px]"
                style={{
                  background: v.cardBg,
                  border: "0.5px solid rgba(10,132,255,0.10)",
                  boxShadow: SH,
                  transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                <div className="w-[36px] h-[36px] rounded-[11px] flex items-center justify-center mb-[8px] relative z-10"
                  style={{ background: v.iconBg, boxShadow: v.iconShadow }}>
                  <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
                </div>
                <div className="text-[12px] font-normal leading-[1.2] mb-[4px] relative z-10" style={{ color: v.nameColor, letterSpacing: "-0.1px" }}>{tpl.title}</div>
                <div className="text-[12px] font-normal leading-[1.4] relative z-10" style={{ color: v.subColor }}>{tpl.desc}</div>
                <Icon className="absolute bottom-[8px] right-[8px] w-9 h-9 pointer-events-none"
                  style={{ color: v.accent, opacity: 0.18 }} strokeWidth={2} />
              </button>
            );
          })}
        </div>

        {/* Recents label */}
        <div className="flex items-center gap-2 px-5 pt-4 text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: T4 }}>
          <span>Recently Generated</span>
          <span className="px-[8px] py-[4px] rounded-full ml-1" style={{ background: "rgba(10,132,255,0.10)", border: "0.5px solid rgba(10,132,255,0.16)", color: B1 }}>
            {recentReports.length} report{recentReports.length === 1 ? "" : "s"}
          </span>
          <span className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
        </div>

        {/* Recents body */}
        {isLoading ? (
          <div className="mx-5 mt-[12px] bg-white rounded-[18px] py-10 flex flex-col items-center gap-3" style={{ border: "0.5px dashed rgba(10,132,255,0.22)", boxShadow: SH }}>
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: B1 }} />
            <p className="text-[12px] font-normal uppercase tracking-widest" style={{ color: T4 }}>Loading reports…</p>
          </div>
        ) : recentReports.length === 0 ? (
          <div className="mx-5 mt-[12px] bg-white rounded-[18px] py-6 px-4 text-center" style={{ border: "0.5px dashed rgba(10,132,255,0.22)", boxShadow: SH }}>
            <div className="w-[46px] h-[46px] rounded-[14px] mx-auto mb-[12px] flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#EBEBF0,#D4E4FF)", border: "0.5px solid rgba(10,132,255,0.18)" }}>
              <Clock className="w-[22px] h-[22px]" style={{ color: B1 }} strokeWidth={2.2} />
            </div>
            <div className="text-[12px] font-normal uppercase tracking-[0.14em] mb-1" style={{ color: T3 }}>No reports generated yet</div>
            <div className="text-[12px] font-normal" style={{ color: T4 }}>Start by picking a template above</div>
          </div>
        ) : (
          <div className="px-5 pt-3 space-y-2">
            {recentReports.map(report => (
              <div key={report.id} className="bg-white rounded-[14px] p-3 flex items-center gap-3"
                style={{ border: `0.5px solid ${SEP}`, boxShadow: SH }}>
                <div className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0"
                  style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 3px 10px rgba(10,132,255,0.22)" }}>
                  <FileText className="w-4 h-4 text-white" strokeWidth={2.3} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-normal truncate" style={{ color: T1 }}>{report.title}</p>
                  <p className="text-[12px] font-normal mt-1" style={{ color: T3 }}>
                    {report.createdAt?.toDate?.().toLocaleDateString("en-IN", { day: "numeric", month: "short" }) || "—"} · {report.format || "PDF"}
                  </p>
                </div>
                <button onClick={() => handleDownload(report)}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(10,132,255,0.10)", color: B1 }}>
                  <Download className="w-[13px] h-[13px]" strokeWidth={2.3} />
                </button>
                <button onClick={() => handleDelete(report.id)} disabled={deletingId === report.id}
                  className="w-8 h-8 rounded-[10px] flex items-center justify-center disabled:opacity-50"
                  style={{ background: RED_S, color: RED }}>
                  {deletingId === report.id ? <Loader2 className="w-[13px] h-[13px] animate-spin" /> : <Trash2 className="w-[13px] h-[13px]" strokeWidth={2.3} />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Action stack */}
        <div className="px-5 pt-3">
          <button onClick={() => setSelectedTemplate("Custom")}
            className="w-full h-[46px] rounded-[14px] flex items-center justify-center gap-[8px] text-[13px] font-normal text-white relative overflow-hidden active:scale-[0.97] transition-transform"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[15px] h-[15px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Generate New Report</span>
          </button>
          <div className="flex gap-2 mt-2">
            <button onClick={() => toast.info("Scheduling panel coming soon")}
              className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-[8px] text-[12px] font-normal bg-white active:scale-[0.96] transition-transform"
              style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <Calendar className="w-[12px] h-[12px]" strokeWidth={2.3} />
              Schedule
            </button>
            <button onClick={() => toast.info("Export kicked off")}
              className="flex-1 h-10 rounded-[12px] flex items-center justify-center gap-[8px] text-[12px] font-normal bg-white active:scale-[0.96] transition-transform"
              style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <Download className="w-[12px] h-[12px]" strokeWidth={2.3} />
              Export Data
            </button>
          </div>
        </div>

        <div className="h-6" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 6px 18px rgba(10,132,255,0.28)" }}>
            <FileText className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-normal leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>Reports</div>
            <div className="text-[12px] mt-1" style={{ color: T3 }}>Generate and manage school reports</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.info("Scheduling panel coming soon")}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-normal bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH }}>
            <Calendar className="w-[14px] h-[14px]" style={{ color: "rgba(10,132,255,0.6)" }} strokeWidth={2.3} />
            Schedule
          </button>
          <button onClick={() => toast.info("Export kicked off")}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-normal bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${SEP}`, color: T2, boxShadow: SH }}>
            <Download className="w-[14px] h-[14px]" style={{ color: "rgba(10,132,255,0.6)" }} strokeWidth={2.3} />
            Export Data
          </button>
          <button onClick={() => setSelectedTemplate("Custom")}
            className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-normal text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[14px] h-[14px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Generate New Report</span>
          </button>
        </div>
      </div>

      {/* Dark Hero */}
      <div className="rounded-[22px] px-8 py-6 relative overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #1D1D1F 0%, #0A84FF 35%, #0A84FF 70%, #0A84FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.30), 0 0 0 0.5px rgba(255,255,255,0.10)",
        }}>
        <div className="absolute -right-12 -top-12 w-[220px] h-[220px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center justify-between gap-6 flex-wrap relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-[16px] flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
              <BarChart3 className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.16em] mb-[8px]" style={{ color: "rgba(255,255,255,0.55)" }}>Available Reports</div>
              <div className="flex items-baseline gap-3">
                <span className="text-[28px] font-normal leading-none tracking-tight">{totalTemplates}</span>
                <span className="text-[14px] font-normal" style={{ color: "rgba(255,255,255,0.50)" }}>templates</span>
                <span className="flex items-center gap-[4px] px-3 py-[8px] rounded-full text-[12px] font-normal"
                  style={{ background: "rgba(52,199,89,0.22)", border: "0.5px solid rgba(52,199,89,0.40)", color: "#66FFAA" }}>
                  <div className="w-[6px] h-[6px] rounded-full" style={{ background: "#66FFAA", boxShadow: "0 0 8px rgba(102,255,170,0.8)" }} />
                  Ready
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            {[
              { val: categoriesCount, lbl: "Categories", color: "#fff" },
              { val: preBuiltCount,   lbl: "Pre-built",  color: "#FFCC00" },
              { val: recentReports.length, lbl: "Generated", color: "#34C759" },
            ].map(x => (
              <div key={x.lbl} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <span className="text-[14px] font-normal" style={{ color: x.color }}>{x.val}</span>
                </div>
                <div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>{x.lbl}</div>
                  <div className="text-[18px] font-normal leading-none" style={{ letterSpacing: "-0.3px", color: x.color }}>{x.val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category cards 5-col — dashboard-style */}
      <div className="grid grid-cols-5 gap-4 mt-5">
        {reportCategories.map(cat => {
          const active = activeCategory === cat.id;
          const p = categoryPalette[cat.tone];
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="rounded-[20px] p-5 relative overflow-hidden transition-transform hover:-translate-y-0.5 text-left flex flex-col min-h-[150px]"
              style={{
                background: p.cardGrad,
                border: `0.5px solid ${active ? p.ringColor : "rgba(10,132,255,0.08)"}`,
                boxShadow: active
                  ? `0 0 0 2px ${p.ringColor}, 0 6px 20px rgba(10,132,255,0.10), 0 22px 56px rgba(10,132,255,0.10)`
                  : "0 0 0 0.5px rgba(10,132,255,0.14), 0 6px 20px rgba(10,132,255,0.10), 0 22px 56px rgba(10,132,255,0.10)",
              }}>
              <div
                className="w-14 h-14 rounded-[14px] flex items-center justify-center mb-3 relative"
                style={{ background: p.tileGrad, boxShadow: p.tileShadow }}
              >
                <cat.icon className="w-[26px] h-[26px] text-white" strokeWidth={2.3} />
              </div>
              <span className="block text-[12px] font-normal uppercase tracking-[0.10em] mb-1.5" style={{ color: "#A1A1A6" }}>{cat.id === "custom" ? "Custom" : "Category"}</span>
              <p className="text-[20px] font-normal tracking-tight leading-tight mb-1" style={{ color: p.nameColor, letterSpacing: "-0.5px" }}>{cat.label}</p>
              <p className="text-[12px] font-normal truncate" style={{ color: "#6E6E73" }}>{cat.count}</p>
              <cat.icon
                className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                style={{ color: p.decorColor, opacity: 0.18 }}
                strokeWidth={2}
              />
            </button>
          );
        })}
      </div>

      {/* Pre-built templates */}
      <div className="mt-5 bg-white rounded-[20px] p-6"
        style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
        <div className="flex items-center gap-[12px] mb-4">
          <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 14px rgba(10,132,255,0.26)" }}>
            <Layout className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <h2 className="text-[16px] font-normal" style={{ color: T1, letterSpacing: "-0.3px" }}>Pre-built Report Templates</h2>
          <span className="text-[12px] font-normal px-3 py-1 rounded-full"
            style={{ background: "rgba(10,132,255,0.10)", color: B1, border: "0.5px solid rgba(10,132,255,0.18)" }}>
            {preBuiltCount} quick picks
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {templates.map((tpl, i) => {
            const theme = templateToneGrad(tpl.tone);
            return (
              <button key={i}
                onClick={() => setSelectedTemplate(tpl.title)}
                className="rounded-[14px] px-4 py-4 flex items-center gap-3 text-left transition-all hover:-translate-y-0.5 hover:bg-white"
                style={{ background: BG, border: `0.5px solid ${SEP}` }}>
                <div className="w-10 h-10 rounded-[11px] flex items-center justify-center shrink-0"
                  style={{ background: theme.bg, border: `0.5px solid ${theme.border}` }}>
                  <tpl.icon className="w-[18px] h-[18px]" style={{ color: theme.color }} strokeWidth={2.3} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-normal mb-1" style={{ color: T1, letterSpacing: "-0.2px" }}>{tpl.title}</div>
                  <div className="text-[12px] font-normal truncate" style={{ color: T4 }}>{tpl.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recently generated */}
      <div className="mt-5 bg-white rounded-[20px] overflow-hidden"
        style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
        <div className="flex items-center justify-between px-6 py-[16px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
          <div className="flex items-center gap-[12px]">
            <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
              style={{ background: VIOLET_S, border: `0.5px solid ${VIOLET_B}` }}>
              <Clock className="w-4 h-4" style={{ color: VIOLET }} strokeWidth={2.4} />
            </div>
            <h2 className="text-[15px] font-normal" style={{ color: T1, letterSpacing: "-0.2px" }}>Recently Generated</h2>
            <span className="text-[12px] font-normal px-3 py-1 rounded-full"
              style={{ background: "rgba(10,132,255,0.10)", color: B1, border: "0.5px solid rgba(10,132,255,0.18)" }}>
              {recentReports.length}
            </span>
          </div>
          {recentReports.length > 0 && (
            <button className="text-[12px] font-normal flex items-center gap-1 transition-colors" style={{ color: B1 }}>
              View All <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} />
            <p className="text-[12px] font-normal uppercase tracking-widest" style={{ color: T4 }}>Loading reports…</p>
          </div>
        ) : recentReports.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <div className="w-[54px] h-[54px] rounded-[16px] flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#EBEBF0,#D4E4FF)", border: "0.5px solid rgba(10,132,255,0.18)" }}>
              <Clock className="w-6 h-6" style={{ color: B1 }} strokeWidth={2.2} />
            </div>
            <p className="text-[13px] font-normal" style={{ color: T1 }}>No reports generated yet</p>
            <p className="text-[12px]" style={{ color: T4 }}>Click "Generate New Report" above to create one</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ background: BG, borderBottom: `0.5px solid ${SEP}` }}>
                  {["Report Name", "Type", "Generated On", "Format", "Actions"].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-[12px] font-normal uppercase tracking-[0.12em]"
                      style={{ color: T4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentReports.map(report => {
                  const fmt = (report.format || "PDF") as "PDF" | "Excel" | "CSV";
                  const fmtTheme = fmt === "Excel" ? { bg: GREEN_S, color: GREEN_D, border: GREEN_B } :
                                   fmt === "CSV"   ? { bg: "rgba(10,132,255,0.10)", color: B1, border: "rgba(10,132,255,0.20)" } :
                                                     { bg: RED_S, color: RED, border: RED_B };
                  return (
                    <tr key={report.id} className="transition-colors hover:bg-[#F8FAFF]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 3px 10px rgba(10,132,255,0.22)" }}>
                            <FileText className="w-4 h-4 text-white" strokeWidth={2.3} />
                          </div>
                          <div>
                            <p className="text-[13px] font-normal" style={{ color: T1 }}>{report.title}</p>
                            <p className="text-[12px] font-normal" style={{ color: T3 }}>{report.generatedBy || "System"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-[4px] rounded-full text-[12px] font-normal"
                          style={{ background: "rgba(10,132,255,0.10)", color: B1, border: "0.5px solid rgba(10,132,255,0.20)" }}>
                          {report.reportType || "General"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[12px] font-normal" style={{ color: T3 }}>
                        {report.createdAt?.toDate?.().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) || "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-[4px] rounded-full text-[12px] font-normal uppercase tracking-[0.08em]"
                          style={{ background: fmtTheme.bg, color: fmtTheme.color, border: `0.5px solid ${fmtTheme.border}` }}>
                          {fmt}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleDownload(report)}
                            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[11px] text-[12px] font-normal text-white transition-transform hover:scale-[1.04]"
                            style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 3px 10px rgba(10,132,255,0.22)" }}>
                            <Download className="w-[13px] h-[13px]" strokeWidth={2.4} />
                            Download
                          </button>
                          <button onClick={() => handleDelete(report.id)} disabled={deletingId === report.id}
                            className="w-9 h-9 rounded-[11px] flex items-center justify-center bg-white disabled:opacity-50 transition-transform hover:scale-[1.04]"
                            style={{ border: `0.5px solid rgba(255,59,48,0.20)`, color: RED }}>
                            {deletingId === report.id ? <Loader2 className="w-[13px] h-[13px] animate-spin" /> : <Trash2 className="w-[13px] h-[13px]" strokeWidth={2.3} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI Card */}
      <div className="mt-5 rounded-[22px] px-8 py-6 relative overflow-hidden"
        style={{
          background: "linear-gradient(140deg, #0A84FF 0%, #0A84FF 48%, #0A84FF 100%)",
          boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-2 mb-3 relative z-10">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
            <BarChart3 className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <span className="text-[12px] font-normal uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Reports Intelligence</span>
        </div>
        <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
          <strong style={{ color: "#fff", fontWeight: 400 }}>{totalTemplates} templates</strong> available across <strong style={{ color: "#fff", fontWeight: 400 }}>{categoriesCount} categories</strong>, with <strong style={{ color: "#fff", fontWeight: 400 }}>{preBuiltCount} ready-to-use pre-built reports</strong>.
          {recentReports.length > 0 ? <> You've generated <strong style={{ color: "#fff", fontWeight: 400 }}>{recentReports.length} report{recentReports.length === 1 ? "" : "s"}</strong> recently — downloads publish to both teachers and parents automatically.</> : <> Generate your first report to publish insights to teachers and parents.</>}
        </p>
        <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
          <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: B4 }} />
          <span className="text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-scoped to {userData?.schoolName || "your school"}</span>
        </div>
      </div>
    </div>
  );
};

export default Reports;