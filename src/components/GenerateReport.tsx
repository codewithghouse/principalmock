import { useState, useEffect } from "react";
import {
  FileText, FileSpreadsheet, BarChart2, Loader2, Download,
  ChevronLeft, Users, CalendarCheck, TrendingUp, AlertTriangle, Shield,
  Settings, Calendar, Mail, Eye,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

interface Props {
  templateName: string;
  onBack: () => void;
}

const REPORT_TYPES = [
  "Student Progress",
  "Class Performance",
  "Monthly Attendance",
  "Risk Students",
  "Exam Results",
  "Teacher Performance",
  "Parent Communication",
  "School Overview",
];

interface SchoolStats {
  totalStudents: number;
  avgAttendance: number;
  avgMarks: number;
  atRisk: number;
  incidents: number;
}

const GenerateReport = ({ templateName, onBack }: Props) => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

  const [reportType, setReportType] = useState(
    templateName && templateName !== "Custom" ? templateName : "Student Progress"
  );
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [grade,     setGrade]     = useState("");
  const [section,   setSection]   = useState("");
  const [subject,   setSubject]   = useState("");
  const [format,    setFormat]    = useState<"PDF" | "Excel" | "CSV">("PDF");
  const [frequency, setFrequency] = useState("");
  const [emailTo,   setEmailTo]   = useState("");

  const [stats,      setStats]      = useState<SchoolStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!userData?.schoolId) return;
    const go = async () => {
      try {
        const sid = userData.schoolId;
        const C: any[] = [where("schoolId", "==", sid)];
        if (userData.branchId) C.push(where("branchId", "==", userData.branchId));

        const enrollSnap = await getDocs(query(collection(db, "enrollments"), ...C));
        const totalStudents = enrollSnap.size;

        const scoresSnap = await getDocs(query(collection(db, "test_scores"), ...C));
        const allPct = scoresSnap.docs
          .map(d => parseFloat(d.data().percentage ?? d.data().score ?? ""))
          .filter(n => !isNaN(n));
        const avgMarks = allPct.length
          ? Math.round(allPct.reduce((a, b) => a + b, 0) / allPct.length)
          : 0;

        const studentScoreMap = new Map<string, number[]>();
        scoresSnap.docs.forEach(d => {
          const data  = d.data();
          const sid2  = data.studentId || data.studentEmail || d.id;
          const pct   = parseFloat(data.percentage ?? data.score ?? "");
          if (!isNaN(pct)) {
            if (!studentScoreMap.has(sid2)) studentScoreMap.set(sid2, []);
            studentScoreMap.get(sid2)!.push(pct);
          }
        });
        let atRisk = 0;
        studentScoreMap.forEach(vals => {
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          if (avg < 50) atRisk++;
        });

        const discSnap = await getDocs(query(collection(db, "discipline"), ...C));

        const attSnap = await getDocs(query(collection(db, "attendance"), ...C));
        const presentCount = attSnap.docs.filter(
          d => (d.data().status || "").toLowerCase() === "present"
        ).length;
        const avgAttendance = attSnap.size
          ? Math.round((presentCount / attSnap.size) * 100)
          : 0;

        setStats({ totalStudents, avgMarks, atRisk, incidents: discSnap.size, avgAttendance });
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    go();
  }, [userData?.schoolId, userData?.branchId]);

  const handleGenerate = async () => {
    if (!userData?.schoolId || !stats) return;
    setGenerating(true);
    try {
      const now       = new Date();
      const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const title     = `${reportType} — ${monthLabel}`;

      const payload = {
        schoolId:          userData.schoolId,
        title,
        reportType,
        format,
        grade:             grade   || "All",
        section:           section || "All",
        subject:           subject || "",
        dateFrom,
        dateTo,
        generatedBy:       userData.name || "Principal",
        status:            "Sent",
        publishedToParent: true,
        publishedToTeacher: true,
        studentId:         "all",
        data: {
          totalStudents:   stats.totalStudents,
          avgAttendance:   stats.avgAttendance,
          avgMarks:        stats.avgMarks,
          atRisk:          stats.atRisk,
          incidents:       stats.incidents,
        },
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "principal_reports"), payload);
      await addDoc(collection(db, "reports"), payload);

      if (frequency && emailTo) {
        await addDoc(collection(db, "scheduled_reports"), {
          ...payload,
          frequency,
          recipients: emailTo,
        });
      }

      toast.success("Report generated and published to teachers & parents!");
      onBack();
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate report. Please try again.");
    }
    setGenerating(false);
  };

  const B1 = "#0A84FF", B2 = "#3395FF", B4 = "#7CBBFF";
  const BG = "#EEF4FF";
  const T1 = "#1D1D1F", T3 = "#6E6E73", T4 = "#A1A1A6";
  const SEP = "rgba(10,132,255,0.08)";
  const GREEN_D = "#248A3D";
  const RED = "#FF3B30", RED_D = "#86170E";
  const VIOLET = "#AF52DE", VIOLET_S = "rgba(175,82,222,0.10)", VIOLET_B = "rgba(175,82,222,0.22)";
  const SH = "0 0 0 0.5px rgba(10,132,255,0.08), 0 2px 10px rgba(10,132,255,0.07), 0 10px 28px rgba(10,132,255,0.09)";
  const SH_LG = "0 0 0 0.5px rgba(10,132,255,0.10), 0 4px 16px rgba(10,132,255,0.10), 0 18px 44px rgba(10,132,255,0.12)";
  const SH_BTN = "0 6px 22px rgba(10,132,255,0.38), 0 2px 5px rgba(10,132,255,0.18)";

  const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const generateDisabled = generating || loading;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 13px",
    background: BG,
    borderRadius: 12,
    border: "0.5px solid rgba(10,132,255,0.14)",
    fontFamily: "inherit",
    fontSize: 12,
    color: T1,
    fontWeight: 400,
    outline: "none",
    letterSpacing: "-0.1px",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    WebkitAppearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235070B0' stroke-width='2.4' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 13px center",
    paddingRight: 34,
  };

  const fmtTheme = (f: "PDF" | "Excel" | "CSV") => {
    if (f === "PDF")    return { bg: "linear-gradient(135deg,#FFE3E8,#FFC0C8)", border: "rgba(255,59,48,0.35)", color: RED_D, shadow: "0 4px 12px rgba(255,59,48,0.18)" };
    if (f === "Excel")  return { bg: "linear-gradient(135deg,#DEFCE8,#B0F0C8)", border: "rgba(52,199,89,0.35)", color: GREEN_D, shadow: "0 4px 12px rgba(52,199,89,0.18)" };
    return                  { bg: "linear-gradient(135deg,#DDEAFF,#B4CCFF)", border: "rgba(10,132,255,0.35)", color: B1,     shadow: "0 4px 12px rgba(10,132,255,0.18)" };
  };

  const previewRows = [
    { label: "Total Students",      val: stats?.totalStudents ?? "—",       Icon: Users,         danger: false },
    { label: "Average Attendance",  val: `${stats?.avgAttendance ?? 0}%`,   Icon: CalendarCheck, danger: false },
    { label: "Average Marks",       val: `${stats?.avgMarks ?? 0}%`,        Icon: TrendingUp,    danger: false },
    { label: "At-Risk Students",    val: stats?.atRisk ?? "—",              Icon: AlertTriangle, danger: (stats?.atRisk ?? 0) > 0 },
    { label: "Discipline Incidents",val: stats?.incidents ?? "—",           Icon: Shield,        danger: false },
  ];

  // ═══════════════════════════════════════════════════════════════
  //  MOBILE
  // ═══════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
        style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif", background: BG, minHeight: "100vh" }}>

        <div className="px-5 pt-4 flex items-center gap-[12px]">
          <button onClick={onBack}
            className="w-[34px] h-[34px] rounded-[11px] flex items-center justify-center bg-white active:scale-[0.94] transition-transform"
            style={{ border: "0.5px solid rgba(10,132,255,0.12)", boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
            <ChevronLeft className="w-4 h-4" style={{ color: B1 }} strokeWidth={2.3} />
          </button>
          <div className="text-[14px] font-normal" style={{ color: T1, letterSpacing: "-0.2px" }}>Generate Report</div>
        </div>

        <div className="flex items-center gap-[8px] px-5 mt-1 text-[12px] font-normal" style={{ color: T4 }}>
          <button onClick={onBack} style={{ color: T3 }}>Reports</button>
          <span>›</span>
          <strong style={{ color: T1, fontWeight: 400 }}>Generate</strong>
        </div>

        <div className="px-5 pt-[16px] flex items-start gap-3">
          <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center shrink-0 mt-1"
            style={{ background: `linear-gradient(135deg, ${VIOLET}, #AF52DE)`, boxShadow: "0 4px 12px rgba(175,82,222,0.32)" }}>
            <Settings className="w-4 h-4 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[22px] font-normal leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>{reportType}</div>
            <div className="text-[12px] mt-1" style={{ color: T3 }}>Configure parameters to generate the report</div>
          </div>
        </div>

        <div className="mx-5 mt-3 bg-white rounded-[20px] p-4 relative overflow-hidden"
          style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="absolute -top-[32px] -right-[32px] w-[120px] h-[120px] rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(10,132,255,0.05) 0%, transparent 70%)" }} />

          <div className="flex items-center gap-[8px] mb-[16px] relative z-10">
            <div className="w-[30px] h-[30px] rounded-[10px] flex items-center justify-center"
              style={{ background: "rgba(10,132,255,0.10)", border: "0.5px solid rgba(10,132,255,0.20)" }}>
              <Settings className="w-[15px] h-[15px]" style={{ color: B1 }} strokeWidth={2.3} />
            </div>
            <div className="text-[13px] font-normal" style={{ color: T1, letterSpacing: "-0.2px" }}>Report Configuration</div>
          </div>

          <div className="space-y-3 relative z-10">
            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Report Type</div>
              <select value={reportType} onChange={e => setReportType(e.target.value)} style={selectStyle}>
                {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Date Range</div>
              <div className="grid grid-cols-[1fr_auto_1fr] gap-[8px] items-center">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
                <span className="text-[12px] font-normal uppercase tracking-[0.08em] px-1" style={{ color: T4 }}>to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Grade</div>
                <input value={grade} onChange={e => setGrade(e.target.value)} placeholder="All" style={inputStyle} />
              </div>
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Section</div>
                <input value={section} onChange={e => setSection(e.target.value)} placeholder="All" style={inputStyle} />
              </div>
            </div>

            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Subject (Optional)</div>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Mathematics" style={inputStyle} />
            </div>

            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Output Format</div>
              <div className="grid grid-cols-3 gap-[8px]">
                {(["PDF", "Excel", "CSV"] as const).map(f => {
                  const active = format === f;
                  const t = fmtTheme(f);
                  return (
                    <button key={f}
                      onClick={() => setFormat(f)}
                      className="rounded-[12px] py-[12px] flex flex-col items-center gap-[4px] text-[12px] font-normal active:scale-[0.95] transition-transform"
                      style={{
                        background: active ? t.bg : BG,
                        border: active ? `0.5px solid ${t.border}` : `0.5px solid rgba(10,132,255,0.14)`,
                        color: active ? t.color : T3,
                        boxShadow: active ? t.shadow : "none",
                        transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                      }}>
                      <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center">
                        {f === "PDF" ? <FileText className="w-[15px] h-[15px]" strokeWidth={2.3} /> :
                         f === "Excel" ? <FileSpreadsheet className="w-[15px] h-[15px]" strokeWidth={2.3} /> :
                         <BarChart2 className="w-[15px] h-[15px]" strokeWidth={2.3} />}
                      </div>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-5 mt-3 bg-white rounded-[20px] overflow-hidden"
          style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
          <div className="px-4 pt-[16px] pb-[12px]">
            <div className="text-[12px] font-normal uppercase tracking-[0.12em]" style={{ color: T4 }}>Report Preview</div>
          </div>
          {loading ? (
            <div className="mx-4 mb-[16px] py-8 rounded-[14px] flex flex-col items-center gap-3" style={{ background: BG }}>
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: B1 }} />
              <p className="text-[12px] font-normal tracking-[0.04em]" style={{ color: T4 }}>Loading school data…</p>
            </div>
          ) : (
            <div className="mx-4 mb-[16px] rounded-[14px] overflow-hidden"
              style={{ border: `0.5px solid rgba(10,132,255,0.14)`, boxShadow: "0 4px 12px rgba(10,132,255,0.08)" }}>
              <div className="px-4 py-[16px] text-center relative overflow-hidden"
                style={{ background: "linear-gradient(135deg, #1D1D1F 0%, #0A84FF 35%, #0A84FF 70%, #0A84FF 100%)" }}>
                <div className="absolute -top-[32px] -right-[20px] w-[100px] h-[100px] rounded-full pointer-events-none"
                  style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
                <div className="text-[14px] font-normal text-white mb-[2px] relative z-10" style={{ letterSpacing: "-0.2px" }}>{reportType} Report</div>
                <div className="text-[12px] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.60)", letterSpacing: "0.04em" }}>{monthLabel}</div>
              </div>
              {previewRows.map(row => (
                <div key={row.label} className="flex items-center justify-between px-4 py-[12px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                  <div className="flex items-center gap-[8px]">
                    <row.Icon className="w-[13px] h-[13px]" style={{ color: T4 }} strokeWidth={2.3} />
                    <span className="text-[12px] font-normal" style={{ color: T3 }}>{row.label}</span>
                  </div>
                  <span className="text-[13px] font-normal" style={{ color: row.danger ? RED : T1, letterSpacing: "-0.2px" }}>{row.val}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mx-5 mt-3 bg-white rounded-[20px] p-4"
          style={{ boxShadow: SH, border: `0.5px solid ${SEP}` }}>
          <div className="flex items-center gap-[8px]">
            <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
              style={{ background: VIOLET_S, border: `0.5px solid ${VIOLET_B}` }}>
              <Calendar className="w-[13px] h-[13px]" style={{ color: VIOLET }} strokeWidth={2.3} />
            </div>
            <div className="text-[13px] font-normal" style={{ color: T1, letterSpacing: "-0.2px" }}>Schedule Delivery</div>
          </div>
          <div className="text-[12px] font-normal pl-[32px] mb-[16px]" style={{ color: T4 }}>Optional — auto-send this report on a schedule</div>

          <div className="space-y-3">
            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Frequency</div>
              <select value={frequency} onChange={e => setFrequency(e.target.value)} style={selectStyle}>
                <option value="">— Select —</option>
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
                <option>Term-wise</option>
              </select>
            </div>
            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[4px]" style={{ color: T4 }}>Email To</div>
              <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="email@school.edu" style={inputStyle} />
            </div>
          </div>
        </div>

        <div className="mx-5 mt-3">
          <button onClick={handleGenerate} disabled={generateDisabled}
            className="w-full h-12 rounded-[14px] flex items-center justify-center gap-2 text-[14px] font-normal text-white relative overflow-hidden active:scale-[0.98] transition-transform disabled:opacity-50"
            style={{
              background: generateDisabled ? "linear-gradient(135deg, #8899C5, #A5B2D0)" : `linear-gradient(135deg, ${B1}, ${B2})`,
              boxShadow: generateDisabled ? "0 4px 12px rgba(100,120,180,0.25)" : SH_BTN,
              transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
            }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            {generating ? (
              <><Loader2 className="w-[15px] h-[15px] animate-spin relative z-10" /><span className="relative z-10">Generating…</span></>
            ) : (
              <><Download className="w-[15px] h-[15px] relative z-10" strokeWidth={2.4} /><span className="relative z-10">Generate & Publish Report</span></>
            )}
          </button>
        </div>

        {!loading && stats && (
          <div className="mx-5 mt-3 rounded-[22px] px-5 py-[16px] relative overflow-hidden"
            style={{
              background: "linear-gradient(140deg, #0A84FF 0%, #0A84FF 48%, #0A84FF 100%)",
              boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
            }}>
            <div className="absolute -top-[32px] -right-[24px] w-[140px] h-[140px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
            <div className="flex items-center gap-[8px] mb-[12px] relative z-10">
              <div className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <Eye className="w-[13px] h-[13px] text-white" strokeWidth={2.3} />
              </div>
              <span className="text-[12px] font-normal uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>Report Snapshot</span>
            </div>
            <div className="grid grid-cols-3 gap-[1px] rounded-[14px] overflow-hidden relative z-10" style={{ background: "rgba(255,255,255,0.12)" }}>
              {[
                { val: stats.totalStudents, lbl: "Students" },
                { val: `${stats.avgMarks}%`, lbl: "Avg Marks" },
                { val: stats.atRisk,        lbl: "At-Risk" },
              ].map(s => (
                <div key={s.lbl} className="text-center py-3" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[20px] font-normal leading-none mb-[4px]" style={{ color: "#fff", letterSpacing: "-0.5px" }}>{s.val}</div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        )}

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

      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-normal bg-white transition-transform hover:scale-[1.02]"
            style={{ border: `0.5px solid ${SEP}`, color: T3, boxShadow: SH }}>
            <ChevronLeft className="w-4 h-4" strokeWidth={2.3} />
            Back to Reports
          </button>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
              style={{ background: `linear-gradient(135deg, ${VIOLET}, #AF52DE)`, boxShadow: "0 6px 18px rgba(175,82,222,0.32)" }}>
              <Settings className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
            </div>
            <div>
              <div className="text-[24px] font-normal leading-none" style={{ color: T1, letterSpacing: "-0.6px" }}>{reportType}</div>
              <div className="text-[12px] mt-1" style={{ color: T3 }}>Configure parameters to generate the report</div>
            </div>
          </div>
        </div>
        <button onClick={handleGenerate} disabled={generateDisabled}
          className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-normal text-white relative overflow-hidden transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          style={{
            background: generateDisabled ? "linear-gradient(135deg, #8899C5, #A5B2D0)" : `linear-gradient(135deg, ${B1}, ${B2})`,
            boxShadow: generateDisabled ? "0 4px 12px rgba(100,120,180,0.25)" : SH_BTN,
          }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
          {generating ? <><Loader2 className="w-[15px] h-[15px] animate-spin relative z-10" /><span className="relative z-10">Generating…</span></>
                      : <><Download className="w-[15px] h-[15px] relative z-10" strokeWidth={2.4} /><span className="relative z-10">Generate & Publish</span></>}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="space-y-5">

          <div className="bg-white rounded-[20px] p-6 relative overflow-hidden"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="absolute -top-[32px] -right-[32px] w-[120px] h-[120px] rounded-full pointer-events-none"
              style={{ background: "radial-gradient(circle, rgba(10,132,255,0.05) 0%, transparent 70%)" }} />
            <div className="flex items-center gap-[12px] mb-5 relative z-10">
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: "0 4px 14px rgba(10,132,255,0.26)" }}>
                <Settings className="w-4 h-4 text-white" strokeWidth={2.4} />
              </div>
              <h2 className="text-[16px] font-normal" style={{ color: T1, letterSpacing: "-0.3px" }}>Report Configuration</h2>
            </div>

            <div className="space-y-4 relative z-10">
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[8px]" style={{ color: T4 }}>Report Type</div>
                <select value={reportType} onChange={e => setReportType(e.target.value)} style={{ ...selectStyle, fontSize: 13, padding: "12px 14px", paddingRight: 34 }}>
                  {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[8px]" style={{ color: T4 }}>Date Range</div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-[12px] items-center">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                  <span className="text-[12px] font-normal uppercase tracking-[0.08em]" style={{ color: T4 }}>to</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[8px]" style={{ color: T4 }}>Grade</div>
                  <input value={grade} onChange={e => setGrade(e.target.value)} placeholder="e.g. Grade 6 or All" style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                </div>
                <div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[8px]" style={{ color: T4 }}>Section</div>
                  <input value={section} onChange={e => setSection(e.target.value)} placeholder="A or All" style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
                </div>
              </div>

              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[8px]" style={{ color: T4 }}>Subject (Optional)</div>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Mathematics" style={{ ...inputStyle, fontSize: 13, padding: "12px 14px" }} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-6"
            style={{ boxShadow: SH, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center gap-[12px] mb-4">
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#FFE3E8,#FFC0C8)", border: "0.5px solid rgba(255,59,48,0.22)" }}>
                <FileText className="w-4 h-4" style={{ color: RED_D }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[16px] font-normal" style={{ color: T1, letterSpacing: "-0.3px" }}>Output Format</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(["PDF", "Excel", "CSV"] as const).map(f => {
                const active = format === f;
                const t = fmtTheme(f);
                return (
                  <button key={f}
                    onClick={() => setFormat(f)}
                    className="rounded-[12px] py-[16px] flex flex-col items-center gap-[8px] text-[12px] font-normal transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active ? t.bg : BG,
                      border: active ? `0.5px solid ${t.border}` : `0.5px solid rgba(10,132,255,0.14)`,
                      color: active ? t.color : T3,
                      boxShadow: active ? t.shadow : "none",
                    }}>
                    <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center">
                      {f === "PDF" ? <FileText className="w-[18px] h-[18px]" strokeWidth={2.3} /> :
                       f === "Excel" ? <FileSpreadsheet className="w-[18px] h-[18px]" strokeWidth={2.3} /> :
                       <BarChart2 className="w-[18px] h-[18px]" strokeWidth={2.3} />}
                    </div>
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-[20px] p-6"
            style={{ boxShadow: SH, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center gap-[12px] mb-1">
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: VIOLET_S, border: `0.5px solid ${VIOLET_B}` }}>
                <Calendar className="w-4 h-4" style={{ color: VIOLET }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[16px] font-normal" style={{ color: T1, letterSpacing: "-0.3px" }}>Schedule Delivery</h2>
            </div>
            <p className="text-[12px] font-normal pl-[46px] mb-4" style={{ color: T4 }}>Optional — auto-send this report on a schedule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[8px]" style={{ color: T4 }}>Frequency</div>
                <select value={frequency} onChange={e => setFrequency(e.target.value)} style={{ ...selectStyle, fontSize: 13, padding: "12px 14px", paddingRight: 34 }}>
                  <option value="">— Select —</option>
                  <option>Daily</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Term-wise</option>
                </select>
              </div>
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em] mb-[8px]" style={{ color: T4 }}>Email To</div>
                <div className="relative">
                  <Mail className="absolute left-[12px] top-1/2 -translate-y-1/2 w-[14px] h-[14px] pointer-events-none" style={{ color: T4 }} strokeWidth={2.3} />
                  <input value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="email@school.edu"
                    style={{ ...inputStyle, fontSize: 13, padding: "12px 14px 12px 38px" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">

          <div className="bg-white rounded-[20px] overflow-hidden"
            style={{ boxShadow: SH_LG, border: `0.5px solid ${SEP}` }}>
            <div className="flex items-center gap-[12px] px-6 py-[16px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
              <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
                style={{ background: VIOLET_S, border: `0.5px solid ${VIOLET_B}` }}>
                <Eye className="w-4 h-4" style={{ color: VIOLET }} strokeWidth={2.4} />
              </div>
              <h2 className="text-[16px] font-normal" style={{ color: T1, letterSpacing: "-0.3px" }}>Report Preview</h2>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="py-10 rounded-[14px] flex flex-col items-center gap-3" style={{ background: BG }}>
                  <Loader2 className="w-10 h-10 animate-spin" style={{ color: B1 }} />
                  <p className="text-[12px] font-normal tracking-[0.04em]" style={{ color: T4 }}>Loading school data…</p>
                </div>
              ) : (
                <div className="rounded-[14px] overflow-hidden"
                  style={{ border: `0.5px solid rgba(10,132,255,0.14)`, boxShadow: "0 4px 12px rgba(10,132,255,0.08)" }}>
                  <div className="px-6 py-[16px] text-center relative overflow-hidden"
                    style={{ background: "linear-gradient(135deg, #1D1D1F 0%, #0A84FF 35%, #0A84FF 70%, #0A84FF 100%)" }}>
                    <div className="absolute -top-[32px] -right-[20px] w-[120px] h-[120px] rounded-full pointer-events-none"
                      style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
                    <div className="text-[18px] font-normal text-white mb-[4px] relative z-10" style={{ letterSpacing: "-0.3px" }}>{reportType} Report</div>
                    <div className="text-[12px] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.60)", letterSpacing: "0.04em" }}>{monthLabel}</div>
                  </div>
                  {previewRows.map(row => (
                    <div key={row.label} className="flex items-center justify-between px-6 py-[16px]" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <div className="flex items-center gap-2">
                        <row.Icon className="w-[15px] h-[15px]" style={{ color: T4 }} strokeWidth={2.3} />
                        <span className="text-[13px] font-normal" style={{ color: T3 }}>{row.label}</span>
                      </div>
                      <span className="text-[16px] font-normal" style={{ color: row.danger ? RED : T1, letterSpacing: "-0.3px" }}>{row.val}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button onClick={handleGenerate} disabled={generateDisabled}
            className="w-full h-[54px] rounded-[14px] flex items-center justify-center gap-[8px] text-[14px] font-normal text-white relative overflow-hidden transition-transform hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100"
            style={{
              background: generateDisabled ? "linear-gradient(135deg, #8899C5, #A5B2D0)" : `linear-gradient(135deg, ${B1}, ${B2})`,
              boxShadow: generateDisabled ? "0 4px 12px rgba(100,120,180,0.25)" : SH_BTN,
            }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            {generating ? <><Loader2 className="w-4 h-4 animate-spin relative z-10" /><span className="relative z-10">Generating…</span></>
                        : <><Download className="w-4 h-4 relative z-10" strokeWidth={2.4} /><span className="relative z-10">Generate & Publish Report</span></>}
          </button>

          {!loading && stats && (
            <div className="rounded-[22px] px-8 py-6 relative overflow-hidden"
              style={{
                background: "linear-gradient(140deg, #0A84FF 0%, #0A84FF 48%, #0A84FF 100%)",
                boxShadow: "0 10px 36px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
              }}>
              <div className="absolute -top-10 -right-7 w-[200px] h-[200px] rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <div className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <Eye className="w-4 h-4 text-white" strokeWidth={2.4} />
                </div>
                <span className="text-[12px] font-normal uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>Report Snapshot</span>
              </div>
              <p className="text-[14px] leading-[1.75] font-normal relative z-10 max-w-[900px]" style={{ color: "rgba(255,255,255,0.88)" }}>
                Based on current school data: <strong style={{ color: "#fff", fontWeight: 400 }}>{stats.totalStudents} students</strong>, averaging <strong style={{ color: "#fff", fontWeight: 400 }}>{stats.avgMarks}%</strong> marks and <strong style={{ color: "#fff", fontWeight: 400 }}>{stats.avgAttendance}% attendance</strong>.
                {stats.atRisk > 0 && <> <strong style={{ color: "#fff", fontWeight: 400 }}>{stats.atRisk} student{stats.atRisk === 1 ? "" : "s"}</strong> flagged at-risk.</>}
                {" "}Report will publish to both teachers and parents on generate.
              </p>
              <div className="flex items-center gap-2 mt-4 pt-3 relative z-10" style={{ borderTop: "0.5px solid rgba(255,255,255,0.12)" }}>
                <div className="w-[6px] h-[6px] rounded-full animate-pulse" style={{ background: B4 }} />
                <span className="text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.45)" }}>Auto-scoped to {userData?.schoolName || "your school"}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerateReport;