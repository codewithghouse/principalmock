import { useState, useEffect } from "react";
import {
  GraduationCap, TrendingUp, TrendingDown, Minus,
  BarChart3, ChevronRight, Loader2,
  Users, Star, AlertTriangle, Sparkles, Search,
  MessageSquare, ArrowRight,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import TeacherProfile from "@/components/TeacherProfile";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";

// ── helpers ──────────────────────────────────────────────────────────────────
const grade = (pct: number) => pct >= 85 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : "D";
const gradeColor = (g: string) => g === "A" ? "text-green-600 bg-green-50" : g === "B" ? "text-blue-600 bg-blue-50" : g === "C" ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";

// robust score parser matches TeacherProfile.tsx pattern — handles percentage, marks/totalMarks, etc.
const getScore = (r: any): number => {
  if (typeof r.percentage === "number" && r.percentage > 0) return Math.round(r.percentage);
  const pctStr = parseFloat(r.percentage ?? "");
  if (!isNaN(pctStr) && pctStr > 0) return Math.round(pctStr);
  const raw = r.marksObtained ?? r.marks ?? r.score ?? null;
  if (raw === null || raw === undefined || raw === "") return 0;
  const total = r.totalMarks ?? r.maxMarks ?? r.outOf ?? 100;
  const rawN = Number(raw), totN = Number(total);
  if (isNaN(rawN)) return 0;
  return totN > 0 ? Math.round((rawN / totN) * 100) : Math.min(100, Math.round(rawN));
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v?.seconds) return new Date(v.seconds * 1000);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

interface TeacherStat {
  id: string;
  name: string;
  raw: any;               // original teacher doc for TeacherProfile component
  subjects: string[];
  classes: string[];      // human-readable class names
  classIds: string[];     // underlying ids for joins
  avgScore: number | null;
  prevAvgScore: number | null;
  studentCount: number;
  classCount: number;
  topSubject: string;
  weakSubject: string;
  monthlyScores: { month: string; avg: number }[];
  vsSchoolAvg: number | null;
  // activity & feedback
  testsCreated: number;
  assignmentsCreated: number;
  lessonPlansCount: number;
  parentNotesCount: number;
  rating: number | null;      // 0-5
  reviewCount: number;
  reviews: { parentName?: string; studentName?: string; rating?: number; review?: string; comment?: string; createdAt?: any }[];
  // subject breakdown for drawer chart
  subjectBreakdown: { subject: string; avg: number; count: number }[];
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ═══════════════════════════════════════════════════════════════════════
// MOCK DATA — flip USE_MOCK_DATA to false to restore live Firestore data
// ═══════════════════════════════════════════════════════════════════════
const USE_MOCK_DATA_TP = true;

const _tpMonths = ["Dec", "Jan", "Feb", "Mar"];

const _mkTeacherStat = (
  base: { id: string; name: string; subject: string; rating: number; experience: string; email: string; phone: string },
  classes: string[],
  classIds: string[],
  classAvg: number,
  studentCount: number,
  testsCreated: number,
  assignmentsCreated: number,
  lessonPlansCount: number,
  parentNotesCount: number,
  reviewCount: number,
  topSubject: string,
  weakSubject: string,
  prevAvgScore: number,
): TeacherStat => ({
  id: base.id,
  name: base.name,
  raw: { ...base, status: "Active", schoolId: "mock-school-001", branchId: "mock-branch-001" },
  subjects: [base.subject],
  classes,
  classIds,
  avgScore: classAvg,
  prevAvgScore,
  studentCount,
  classCount: classes.length,
  topSubject,
  weakSubject,
  monthlyScores: _tpMonths.map((m, i) => ({
    month: m,
    avg: Math.max(40, Math.min(99, prevAvgScore + (classAvg - prevAvgScore) * (i / (_tpMonths.length - 1)) + (i % 2 === 0 ? 1 : -1))),
  })),
  vsSchoolAvg: classAvg - 78, // school avg ~78
  testsCreated, assignmentsCreated, lessonPlansCount, parentNotesCount,
  rating: base.rating,
  reviewCount,
  reviews: reviewCount === 0 ? [] : [
    { parentName: "Mrs. Sharma",  studentName: "Aarav Sharma",   rating: 5, comment: `${base.name.split(" ").slice(-1)[0]} is an exceptional ${base.subject.toLowerCase()} teacher. ${base.name.split(" ")[0]} keeps the children deeply engaged.` },
    { parentName: "Mr. Khanna",   studentName: "Ishaan Khanna",  rating: 4, comment: `Communicative and patient. We love the regular weekly updates.` },
    { parentName: "Mrs. Iyer",    studentName: "Ananya Iyer",    rating: 5, comment: `Best teacher in the school. Wish all subjects had ${base.name.split(" ")[0]} as the lead.` },
  ].slice(0, Math.min(3, reviewCount)),
  subjectBreakdown: [{ subject: base.subject, avg: classAvg, count: studentCount }],
});

const MOCK_TEACHERS_TP: TeacherStat[] = [
  _mkTeacherStat({ id: "t-priya",   name: "Mrs. Priya Mehta",     subject: "Mathematics",      rating: 4.9, experience: "14 years", email: "priya.mehta@school.edu",    phone: "+91 98765 22007" }, ["Grade 8B"],            ["cls-8b"],                       88, 31, 12, 8, 24, 6, 18, "Algebra", "Probability",    78),
  _mkTeacherStat({ id: "t-anil",    name: "Dr. Anil Reddy",       subject: "Science",          rating: 4.8, experience: "15 years", email: "anil.reddy@school.edu",     phone: "+91 98765 22015" }, ["Grade 8B", "Grade 8C"],["cls-8b", "cls-8c"],             82, 61, 10, 6, 20, 4, 14, "Photosynthesis","Acids/Bases",  74),
  _mkTeacherStat({ id: "t-rashmi",  name: "Mrs. Rashmi Pandey",   subject: "Physics",          rating: 4.8, experience: "16 years", email: "rashmi.pandey@school.edu",  phone: "+91 98765 22011" }, ["Grade 10A"],            ["cls-10a"],                      89, 32, 14, 7, 18, 3, 12, "Mechanics", "—",           81),
  _mkTeacherStat({ id: "t-kiran",   name: "Mr. Kiran Patel",      subject: "English",          rating: 4.7, experience: "11 years", email: "kiran.patel@school.edu",    phone: "+91 98765 22013" }, ["Grade 8A","Grade 8B","Grade 8C"], ["cls-8a","cls-8b","cls-8c"], 78, 93, 11, 7, 22, 8, 15, "Vocabulary","Reading",         72),
  _mkTeacherStat({ id: "t-meena",   name: "Mrs. Meena Kapoor",    subject: "English",          rating: 4.7, experience: "15 years", email: "meena.kapoor@school.edu",   phone: "+91 98765 22003" }, ["Grade 7A"],             ["cls-7a"],                       79, 33, 9,  5, 16, 2, 10, "Grammar",   "Essay Writing",  73),
  _mkTeacherStat({ id: "t-anita",   name: "Mrs. Anita Choudhury", subject: "Biology",          rating: 4.6, experience: "13 years", email: "anita.choudhury@school.edu",phone: "+91 98765 22009" }, ["Grade 9A"],             ["cls-9a"],                       87, 30, 8,  6, 14, 3, 11, "Cell Bio",  "Genetics",       82),
  _mkTeacherStat({ id: "t-vandana", name: "Mrs. Vandana Singh",   subject: "Mathematics",      rating: 4.6, experience: "12 years", email: "vandana.singh@school.edu",  phone: "+91 98765 22001" }, ["Grade 6A"],             ["cls-6a"],                       68, 34, 9,  6, 14, 5, 8,  "Arithmetic","Word Problems",  62),
  _mkTeacherStat({ id: "t-neha",    name: "Ms. Neha Iyer",        subject: "Computer Science", rating: 4.6, experience: "5 years",  email: "neha.iyer@school.edu",      phone: "+91 98765 22017" }, ["Grade 7A","Grade 8B","Grade 9B","Grade 10A"], ["cls-7a","cls-8b","cls-9b","cls-10a"], 84, 124, 7, 8, 12, 1, 9, "HTML",      "Algorithms",     78),
  _mkTeacherStat({ id: "t-vikash",  name: "Mr. Vikash Kumar",     subject: "Chemistry",        rating: 4.5, experience: "11 years", email: "vikash.kumar@school.edu",   phone: "+91 98765 22010" }, ["Grade 9B"],             ["cls-9b"],                       81, 28, 8,  5, 13, 4, 9,  "Reactions", "Organic Chem",   76),
  _mkTeacherStat({ id: "t-sandeep", name: "Mr. Sandeep Joshi",    subject: "Physical Education", rating: 4.5, experience: "9 years", email: "sandeep.joshi@school.edu", phone: "+91 98765 22006" }, ["Grade 8A"],             ["cls-8a"],                       88, 32, 4,  3, 8,  2, 7,  "Athletics", "—",              85),
  _mkTeacherStat({ id: "t-sunita",  name: "Mrs. Sunita Verma",    subject: "Hindi",            rating: 4.5, experience: "18 years", email: "sunita.verma@school.edu",   phone: "+91 98765 22014" }, ["Grade 8A","Grade 8B","Grade 9A"], ["cls-8a","cls-8b","cls-9a"], 80, 92, 7, 5, 12, 4, 10, "Vyakaran",  "Patra Lekhan",   76),
  _mkTeacherStat({ id: "t-deepa",   name: "Mrs. Deepa Nair",      subject: "Hindi",            rating: 4.4, experience: "10 years", email: "deepa.nair@school.edu",     phone: "+91 98765 22005" }, ["Grade 7C"],             ["cls-7c"],                       58, 29, 6,  4, 10, 6, 7,  "Sandhi",    "Reading Comp",   54),
  _mkTeacherStat({ id: "t-faisal",  name: "Mr. Faisal Ahmed",     subject: "Mathematics",      rating: 4.4, experience: "9 years",  email: "faisal.ahmed@school.edu",   phone: "+91 98765 22012" }, ["Grade 10B"],            ["cls-10b"],                      83, 29, 9,  6, 12, 3, 8,  "Trigonometry","Statistics",   77),
  _mkTeacherStat({ id: "t-rahul",   name: "Mr. Rahul Khanna",     subject: "Social Studies",   rating: 4.3, experience: "8 years",  email: "rahul.khanna@school.edu",   phone: "+91 98765 22016" }, ["Grade 8B","Grade 9A","Grade 9B"], ["cls-8b","cls-9a","cls-9b"], 80, 89, 7, 4, 11, 2, 8, "History",   "Geography Maps", 76),
  _mkTeacherStat({ id: "t-arjun",   name: "Mr. Arjun Bhatt",      subject: "Social Studies",   rating: 4.3, experience: "6 years",  email: "arjun.bhatt@school.edu",    phone: "+91 98765 22004" }, ["Grade 7B"],             ["cls-7b"],                       64, 31, 6,  5, 9,  3, 6,  "Civics",    "Geography",      58),
  _mkTeacherStat({ id: "t-rohit",   name: "Mr. Rohit Mishra",     subject: "Science",          rating: 4.2, experience: "8 years",  email: "rohit.mishra@school.edu",   phone: "+91 98765 22002" }, ["Grade 6B"],             ["cls-6b"],                       51, 32, 5,  4, 8,  4, 5,  "Living World","Force",        45),
  _mkTeacherStat({ id: "t-suresh",  name: "Mr. Suresh Kulkarni",  subject: "Mathematics",      rating: 4.1, experience: "7 years",  email: "suresh.kulkarni@school.edu",phone: "+91 98765 22008" }, ["Grade 8C"],             ["cls-8c"],                       73, 30, 7,  5, 11, 5, 6,  "Algebra",   "Mensuration",    68),
];
const MOCK_SCHOOL_AVG_TP = Math.round(MOCK_TEACHERS_TP.reduce((s, t) => s + (t.avgScore || 0), 0) / MOCK_TEACHERS_TP.length);

const TeacherPerformance = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [teachers,    setTeachers]    = useState<TeacherStat[]>(USE_MOCK_DATA_TP ? MOCK_TEACHERS_TP : []);
  const [loading,     setLoading]     = useState(USE_MOCK_DATA_TP ? false : true);
  const [selected,    setSelected]    = useState<TeacherStat | null>(null);
  const [schoolAvg,   setSchoolAvg]   = useState<number>(USE_MOCK_DATA_TP ? MOCK_SCHOOL_AVG_TP : 0);
  const [search,      setSearch]      = useState("");

  useEffect(() => {
    if (USE_MOCK_DATA_TP) return; // Mock mode: teachers + schoolAvg pre-seeded above
    if (!userData?.schoolId) return;
    setLoading(true);

    const schoolId = userData.schoolId;
    const branchId = userData?.branchId || "";
    const C: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) C.push(where("branchId", "==", branchId));

    // Some collections (tests, assignments, lessonPlans, parent_notes, teacher_reviews, results)
    // may not carry branchId — so only schoolId filter is safe there.
    const CS: any[] = [where("schoolId", "==", schoolId)];

    // ── Listen to teachers ────────────────────────────────────────────────
    const tUnsub = onSnapshot(
      query(collection(db, "teachers"), ...C),
      async (tSnap) => {
        const teacherDocs = tSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        // ── Fetch every relevant collection in parallel ───────────────────
        const safeGet = async (q: any) => {
          try { return await getDocs(q); } catch { return { docs: [] as any[] }; }
        };
        const [
          scoresSnap, assignSnap, classesSnap,
          testsSnap, assignmentsSnap, lessonsSnap,
          notesSnap, reviewsSnap, resultsSnap,
        ] = await Promise.all([
          safeGet(query(collection(db, "test_scores"),          ...C)),
          safeGet(query(collection(db, "teaching_assignments"), ...C)),
          safeGet(query(collection(db, "classes"),              ...C)),
          safeGet(query(collection(db, "tests"),                ...CS)),
          safeGet(query(collection(db, "assignments"),          ...CS)),
          safeGet(query(collection(db, "lessonPlans"),          ...CS)),
          safeGet(query(collection(db, "parent_notes"),         ...CS)),
          safeGet(query(collection(db, "teacher_reviews"),      ...CS)),
          safeGet(query(collection(db, "results"),              ...CS)),
        ]);

        const scores      = scoresSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const assigns     = assignSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const classDocs   = classesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const testDocs    = testsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const asgnDocs    = assignmentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const lessonDocs  = lessonsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const noteDocs    = notesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const reviewDocs  = reviewsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));
        const resultDocs  = resultsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() as any }));

        // classId → name lookup
        const classNameById = new Map<string, string>();
        classDocs.forEach((c: any) => {
          const label = c.name || [c.grade, c.section].filter(Boolean).join(" ") || c.className;
          if (label) classNameById.set(c.id, label);
        });

        const now      = new Date();
        const cutoff30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
        const cutoff60 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60);

        // Combine test_scores + results — both represent graded assessments created by teacher
        const allScoreRows = [...scores, ...resultDocs];

        // School-wide average (uses richer getScore — handles marks/totalMarks)
        const allPcts = allScoreRows.map(s => getScore(s)).filter(n => n > 0);
        const overallAvg = allPcts.length ? Math.round(allPcts.reduce((a,b)=>a+b,0) / allPcts.length) : 0;
        setSchoolAvg(overallAvg);

        const stats: TeacherStat[] = teacherDocs.map((t: any) => {
          // Classes & subjects from teaching_assignments + fallback to teacher doc
          const tAssigns = assigns.filter((a: any) => a.teacherId === t.id || a.teacherEmail === t.email);

          const subjectsSet = new Set<string>();
          tAssigns.forEach((a: any) => a.subject && subjectsSet.add(a.subject));
          if (t.subject) subjectsSet.add(t.subject);
          if (Array.isArray(t.subjects)) t.subjects.forEach((s: string) => s && subjectsSet.add(s));
          const subjects = [...subjectsSet];

          const classIdsSet = new Set<string>();
          tAssigns.forEach((a: any) => a.classId && classIdsSet.add(a.classId));
          // also pull classes where teacherId matches directly
          classDocs.forEach((c: any) => { if (c.teacherId === t.id) classIdsSet.add(c.id); });
          const classIds = [...classIdsSet];

          // Resolve to human-readable names — prefer classes collection, then teaching_assignments className
          const classes = classIds.map(cid => {
            if (classNameById.has(cid)) return classNameById.get(cid)!;
            const ta = tAssigns.find((a: any) => a.classId === cid);
            return ta?.className || cid;
          });

          // All score rows attributable to this teacher — match by teacherId OR classId
          const tScores = allScoreRows.filter(s =>
            s.teacherId === t.id ||
            (s.classId && classIds.includes(s.classId))
          );

          const pcts = tScores.map(s => getScore(s)).filter(n => n > 0);
          const avgScore = pcts.length ? Math.round(pcts.reduce((a,b)=>a+b,0) / pcts.length) : null;

          // Previous 30-60 day avg for trend delta
          const prevScores = tScores.filter(s => {
            const d = toDate(s.createdAt || s.timestamp || s.date);
            return d && d >= cutoff60 && d < cutoff30;
          });
          const prevPcts = prevScores.map(s => getScore(s)).filter(n => n > 0);
          const prevAvg  = prevPcts.length ? Math.round(prevPcts.reduce((a,b)=>a+b,0) / prevPcts.length) : null;

          // Monthly trend (last 4 months) — use any available timestamp
          const months = Array.from({length:4}, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth()-3+i, 1);
            return { label: MONTH_NAMES[d.getMonth()], month: d.getMonth(), year: d.getFullYear() };
          });
          const monthlyScores = months.map(({ label, month, year }) => {
            const mScores = tScores.filter(s => {
              const ts = toDate(s.createdAt || s.timestamp || s.date);
              return ts && ts.getMonth() === month && ts.getFullYear() === year;
            });
            const mPcts = mScores.map(s => getScore(s)).filter(n => n > 0);
            return { month: label, avg: mPcts.length ? Math.round(mPcts.reduce((a,b)=>a+b,0)/mPcts.length) : 0 };
          });

          // Per-subject breakdown — consider subjectName / subject fallback
          const subjectMap: Record<string, number[]> = {};
          tScores.forEach(s => {
            const sub = s.subjectName || s.subject || (subjects[0] || "General");
            if (!subjectMap[sub]) subjectMap[sub] = [];
            const sc = getScore(s);
            if (sc > 0) subjectMap[sub].push(sc);
          });
          const subjectBreakdown = Object.entries(subjectMap)
            .map(([subject, vals]) => ({
              subject,
              count: vals.length,
              avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length),
            }))
            .sort((a,b)=>b.avg-a.avg);
          const topSubject  = subjectBreakdown.length ? subjectBreakdown[0].subject : "—";
          const weakSubject = subjectBreakdown.length ? subjectBreakdown[subjectBreakdown.length-1].subject : "—";

          const studentCount = [...new Set(tScores.map(s => s.studentId || s.studentEmail).filter(Boolean))].length;

          // Activity counts — everything this teacher created
          const testsCreated       = testDocs.filter((d: any) => d.teacherId === t.id).length;
          const assignmentsCreated = asgnDocs.filter((d: any) => d.teacherId === t.id).length;
          const lessonPlansCount   = lessonDocs.filter((d: any) => d.teacherId === t.id).length;
          const parentNotesCount   = noteDocs.filter((d: any) => d.teacherId === t.id).length;

          // Ratings & reviews
          const tReviews = reviewDocs
            .filter((r: any) => r.teacherId === t.id)
            .sort((a: any, b: any) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
          const ratingVals = tReviews.map((r: any) => Number(r.rating)).filter(n => !isNaN(n) && n > 0);
          const rating = ratingVals.length
            ? Math.round((ratingVals.reduce((a,b)=>a+b,0) / ratingVals.length) * 10) / 10
            : (t.rating ? Number(t.rating) : null);

          return {
            id: t.id,
            name: t.name || t.teacherName || "Unknown",
            raw: t,
            subjects,
            classes,
            classIds,
            avgScore,
            prevAvgScore: prevAvg,
            studentCount,
            classCount: classes.length,
            topSubject,
            weakSubject,
            monthlyScores,
            vsSchoolAvg: avgScore != null ? avgScore - overallAvg : null,
            testsCreated,
            assignmentsCreated,
            lessonPlansCount,
            parentNotesCount,
            rating,
            reviewCount: tReviews.length,
            reviews: tReviews.slice(0, 5),
            subjectBreakdown,
          };
        });

        setTeachers(stats.filter(t => t.name !== "Unknown"));
        setLoading(false);
      }
    );
    return () => tUnsub();
  }, [userData?.schoolId, userData?.branchId]);

  const filtered = teachers.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.subjects.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  const trend = (t: TeacherStat) => {
    if (t.avgScore == null || t.prevAvgScore == null) return null;
    const delta = t.avgScore - t.prevAvgScore;
    if (delta > 2)  return { icon: TrendingUp,   color: "text-green-500", label: `+${delta}%` };
    if (delta < -2) return { icon: TrendingDown,  color: "text-red-500",   label: `${delta}%` };
    return               { icon: Minus,          color: "text-slate-400",  label: "Stable" };
  };

  // ── When a teacher is selected, render the full TeacherProfile page (same layout as existing profile)
  if (selected) {
    return (
      <div className="animate-in fade-in duration-200">
        <TeacherProfile teacher={selected.raw} onBack={() => setSelected(null)} />
      </div>
    );
  }

  // ───────────────────────── MOBILE RETURN ─────────────────────────────────
  if (isMobile) {
    const B1 = "#0A84FF";
    const B2 = "#3395FF";
    const B3 = "#5BA9FF";
    const B4 = "#7CBBFF";
    const GREEN = "#34C759";
    const RED = "#FF3B30";
    const ORANGE = "#FF9500";
    const GOLD = "#FFCC00";
    const T1 = "#1D1D1F";
    const T2 = "#3A3A3C";
    const T3 = "#6E6E73";
    const T4 = "#A1A1A6";
    const SEP = "rgba(10,132,255,.07)";

    const topPerformersCount = teachers.filter((t) => (t.avgScore ?? 0) >= 80).length;
    const needsSupportCount = teachers.filter((t) => t.avgScore != null && t.avgScore < 60).length;

    const avgTierInfo =
      schoolAvg >= 85
        ? { label: "Excellent Tier", bg: "rgba(52,199,89,.20)", border: "rgba(52,199,89,.35)", color: "#34C759" }
        : schoolAvg >= 75
        ? { label: "Strong Tier", bg: "rgba(10,132,255,.20)", border: "rgba(10,132,255,.35)", color: "#99BBFF" }
        : schoolAvg >= 60
        ? { label: "Average Tier", bg: "rgba(255,149,0,.20)", border: "rgba(255,149,0,.35)", color: "#FFCC00" }
        : schoolAvg > 0
        ? { label: "Needs Attention", bg: "rgba(255,59,48,.20)", border: "rgba(255,59,48,.35)", color: "#FF6961" }
        : { label: "No Data", bg: "rgba(153,170,204,.18)", border: "rgba(153,170,204,.32)", color: "#CCDDEE" };

    const schoolAvgColor = schoolAvg >= 75 ? GREEN : schoolAvg >= 60 ? ORANGE : schoolAvg > 0 ? RED : T4;

    const subjectTagStyle = (subject: string) => {
      const s = (subject || "").toLowerCase();
      if (s.includes("math")) return { bg: "rgba(255,149,0,.10)", color: "#86310C", border: "0.5px solid rgba(255,149,0,.22)" };
      if (s.includes("english") || s.includes("lang")) return { bg: "rgba(10,132,255,.10)", color: B1, border: "0.5px solid rgba(10,132,255,.20)" };
      if (s.includes("sci") || s.includes("chem") || s.includes("phy") || s.includes("bio")) return { bg: "rgba(175,82,222,.10)", color: "#AF52DE", border: "0.5px solid rgba(175,82,222,.22)" };
      if (s.includes("social") || s.includes("hist") || s.includes("geo")) return { bg: "rgba(255,204,0,.10)", color: "#86310C", border: "0.5px solid rgba(255,204,0,.22)" };
      return { bg: "rgba(10,132,255,.10)", color: B1, border: "0.5px solid rgba(10,132,255,.20)" };
    };

    const avatarGradFor = (name: string, hasData: boolean, avg: number | null) => {
      if (!hasData) return `linear-gradient(135deg, ${ORANGE}, #FFCC00)`;
      if (avg! >= 80) return `linear-gradient(135deg, ${GREEN}, #34C759)`;
      if (avg! >= 60) return `linear-gradient(135deg, ${B1}, ${B3})`;
      return `linear-gradient(135deg, ${RED}, #FF5E55)`;
    };

    const accentFor = (hasData: boolean, avg: number | null) => {
      if (!hasData) return `linear-gradient(180deg, ${ORANGE}, #FFCC00)`;
      if (avg! >= 80) return `linear-gradient(180deg, ${GREEN}, #34C759)`;
      if (avg! >= 60) return `linear-gradient(180deg, ${B1}, ${B4})`;
      return `linear-gradient(180deg, ${RED}, #FF6961)`;
    };

    const avShadowFor = (hasData: boolean, avg: number | null) => {
      if (!hasData) return "0 4px 14px rgba(255,149,0,.28)";
      if (avg! >= 80) return "0 4px 14px rgba(52,199,89,.28)";
      if (avg! >= 60) return "0 4px 14px rgba(10,132,255,.28)";
      return "0 4px 14px rgba(255,59,48,.28)";
    };

    return (
      <div
        data-sfpro
        style={{
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter', sans-serif",
          background: "#F5F5F7",
          minHeight: "100vh",
          paddingBottom: 24,
        }}
      >
        {/* PAGE HEAD */}
        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 24, fontWeight: 600, color: T1, letterSpacing: "-0.6px", marginBottom: 3 }}>
              Teacher Performance
            </div>
            <div style={{ fontSize: 11, color: T3, fontWeight: 400, lineHeight: 1.5 }}>
              Impact analysis — same subject across teachers,<br />same teacher across classes
            </div>
          </div>
          <button
            onClick={() => {
              document.getElementById("mobile-tp-search")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 13px",
              borderRadius: 14,
              background: "#fff",
              border: "0.5px solid rgba(10,132,255,.14)",
              boxShadow: "0 0 0 .5px rgba(10,132,255,.08), 0 2px 8px rgba(10,132,255,.08)",
              flexShrink: 0,
              marginTop: 4,
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: T4, marginBottom: 2 }}>
                School Avg
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: schoolAvgColor, letterSpacing: "-0.3px", lineHeight: 1 }}>
                {schoolAvg}%
              </div>
            </div>
            <BarChart3 size={14} color={schoolAvgColor} strokeWidth={2.4} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Loader2 size={28} color={B1} style={{ animation: "spin 1s linear infinite" }} />
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <>
            {/* HERO */}
            <div
              style={{
                margin: "14px 20px 0",
                background: "linear-gradient(135deg,#1D1D1F 0%,#0A84FF 35%,#0A84FF 70%,#0A84FF 100%)",
                borderRadius: 22,
                padding: "16px 18px",
                position: "relative",
                overflow: "hidden",
                boxShadow: "0 8px 26px rgba(0,8,60,.28), 0 0 0 .5px rgba(255,255,255,.12)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: -36,
                  right: -24,
                  width: 150,
                  height: 150,
                  background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                  borderRadius: "50%",
                  pointerEvents: "none",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, position: "relative", zIndex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      background: "rgba(255,255,255,.16)",
                      border: "0.5px solid rgba(255,255,255,.24)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <GraduationCap size={18} color="rgba(255,255,255,.92)" strokeWidth={2.1} />
                  </div>
                  <div>
                    <div style={{ fontSize: 8, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.50)", marginBottom: 3 }}>
                      Avg Class Score
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 600, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1 }}>
                      {schoolAvg}%
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 12px",
                    borderRadius: 100,
                    background: avgTierInfo.bg,
                    border: `0.5px solid ${avgTierInfo.border}`,
                    fontSize: 11,
                    fontWeight: 600,
                    color: avgTierInfo.color,
                  }}
                >
                  <BarChart3 size={11} strokeWidth={2.5} />
                  {avgTierInfo.label}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 1,
                  background: "rgba(255,255,255,.12)",
                  borderRadius: 14,
                  overflow: "hidden",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {[
                  { v: teachers.length, l: "Teachers", c: "#fff" },
                  { v: topPerformersCount, l: "Top Perf.", c: "#34C759" },
                  { v: needsSupportCount, l: "Needs Support", c: needsSupportCount > 0 ? "#FF6961" : "#fff" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "11px 12px", textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 600, color: s.c, letterSpacing: "-0.4px", lineHeight: 1, marginBottom: 3 }}>
                      {s.v}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                      {s.l}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* STAT GRID */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "14px 20px 0" }}>
              {[
                {
                  label: "Total Teachers",
                  value: teachers.length,
                  sub: "Active faculty",
                  color: B1,
                  subColor: T4,
                  icon: <Users size={13} color={B1} strokeWidth={2.4} />,
                  bg: "rgba(10,132,255,.10)",
                  border: "rgba(10,132,255,.18)",
                  glow: "rgba(10,132,255,.10)",
                },
                {
                  label: "Avg Class Score",
                  value: `${schoolAvg}%`,
                  sub: avgTierInfo.label,
                  color: schoolAvgColor,
                  subColor: schoolAvg >= 75 ? "#248A3D" : schoolAvg >= 60 ? "#86310C" : schoolAvg > 0 ? RED : T4,
                  icon: <BarChart3 size={13} color={schoolAvgColor} strokeWidth={2.4} />,
                  bg: schoolAvg >= 75 ? "rgba(52,199,89,.10)" : schoolAvg >= 60 ? "rgba(255,149,0,.10)" : schoolAvg > 0 ? "rgba(255,59,48,.10)" : "rgba(153,170,204,.12)",
                  border: schoolAvg >= 75 ? "rgba(52,199,89,.22)" : schoolAvg >= 60 ? "rgba(255,149,0,.22)" : schoolAvg > 0 ? "rgba(255,59,48,.22)" : "rgba(153,170,204,.22)",
                  glow: schoolAvg >= 75 ? "rgba(52,199,89,.10)" : schoolAvg >= 60 ? "rgba(255,149,0,.10)" : schoolAvg > 0 ? "rgba(255,59,48,.10)" : "rgba(153,170,204,.10)",
                },
                {
                  label: "Top Performers",
                  value: topPerformersCount,
                  sub: topPerformersCount === 0 ? "No records" : topPerformersCount === 1 ? "1 standout" : `${topPerformersCount} standouts`,
                  color: topPerformersCount > 0 ? "#248A3D" : T3,
                  subColor: topPerformersCount > 0 ? "#248A3D" : T4,
                  icon: <Star size={13} color={GREEN} strokeWidth={2.4} />,
                  bg: "rgba(52,199,89,.10)",
                  border: "rgba(52,199,89,.22)",
                  glow: "rgba(52,199,89,.10)",
                },
                {
                  label: "Needs Support",
                  value: needsSupportCount,
                  sub: needsSupportCount === 0 ? "All clear" : needsSupportCount === 1 ? "1 teacher" : `${needsSupportCount} teachers`,
                  color: needsSupportCount > 0 ? RED : T3,
                  subColor: needsSupportCount > 0 ? RED : T4,
                  icon: <AlertTriangle size={13} color={RED} strokeWidth={2.4} />,
                  bg: "rgba(255,59,48,.10)",
                  border: "rgba(255,59,48,.22)",
                  glow: "rgba(255,59,48,.10)",
                },
              ].map((c, i) => (
                <div
                  key={i}
                  style={{
                    background: "#fff",
                    borderRadius: 20,
                    padding: 15,
                    boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 18px 44px rgba(10,132,255,.13)",
                    border: "0.5px solid rgba(10,132,255,.10)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: -18,
                      right: -14,
                      width: 65,
                      height: 65,
                      background: `radial-gradient(circle, ${c.glow} 0%, transparent 70%)`,
                      borderRadius: "50%",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: 13,
                      right: 13,
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      background: c.bg,
                      border: `0.5px solid ${c.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {c.icon}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: T4, marginBottom: 9 }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-1px", lineHeight: 1, marginBottom: 4, color: c.color }}>
                    {c.value}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: c.subColor }}>{c.sub}</div>
                </div>
              ))}
            </div>

            {/* SEARCH */}
            <div style={{ margin: "12px 20px 0", position: "relative" }}>
              <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "flex" }}>
                <Search size={15} color="rgba(10,132,255,.42)" strokeWidth={2.2} />
              </div>
              <input
                id="mobile-tp-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by teacher or subject..."
                style={{
                  width: "100%",
                  padding: "12px 16px 12px 42px",
                  background: "#fff",
                  borderRadius: 14,
                  border: "0.5px solid rgba(10,132,255,.12)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  color: T1,
                  fontWeight: 400,
                  outline: "none",
                  boxShadow: "0 0 0 .5px rgba(10,132,255,.08), 0 2px 8px rgba(10,132,255,.08)",
                }}
              />
            </div>

            {/* SECTION LABEL */}
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color: T4,
                padding: "16px 20px 0",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>Faculty Performance</span>
              <span
                style={{
                  padding: "3px 9px",
                  borderRadius: 100,
                  background: "rgba(10,132,255,.10)",
                  border: "0.5px solid rgba(10,132,255,.16)",
                  fontSize: 9,
                  fontWeight: 600,
                  color: B1,
                  textTransform: "none",
                  letterSpacing: "0.04em",
                }}
              >
                {filtered.length} teacher{filtered.length === 1 ? "" : "s"}
              </span>
              <span style={{ flex: 1, height: "0.5px", background: "rgba(10,132,255,.12)" }} />
            </div>

            {/* TEACHER CARDS */}
            {filtered.length === 0 ? (
              <div
                style={{
                  margin: "12px 20px 0",
                  background: "#fff",
                  borderRadius: 22,
                  padding: "32px 20px",
                  boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <GraduationCap size={44} color="rgba(10,132,255,.22)" strokeWidth={1.8} />
                <div style={{ fontSize: 14, fontWeight: 600, color: T1 }}>No teacher data found</div>
                <div style={{ fontSize: 11, color: T4, textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
                  Assign teachers to classes to see performance metrics.
                </div>
              </div>
            ) : (
              filtered.map((t) => {
                const hasScoreData = t.avgScore != null;
                const tr = trend(t);
                const tLetter = hasScoreData ? grade(t.avgScore!) : "—";
                const primarySubject = t.subjects[0] || "Teacher";
                const subjStyle = subjectTagStyle(primarySubject);
                const initText = t.name.substring(0, 2).toUpperCase();

                const avgBarColor = !hasScoreData
                  ? `linear-gradient(90deg, ${ORANGE}, #FFCC00)`
                  : t.avgScore! >= 80
                  ? `linear-gradient(90deg, ${GREEN}, #34C759)`
                  : t.avgScore! >= 60
                  ? `linear-gradient(90deg, ${ORANGE}, #FFCC00)`
                  : `linear-gradient(90deg, ${RED}, #FF6961)`;
                const avgValColor = !hasScoreData
                  ? T4
                  : t.avgScore! >= 80
                  ? GREEN
                  : t.avgScore! >= 60
                  ? ORANGE
                  : RED;

                let trendIconEl = <Minus size={12} color={T4} strokeWidth={2.4} />;
                let trendColor = T4;
                let trendLabel = "—";
                let trendBg = "#F5F5F7";
                let trendBorder = "rgba(153,170,204,.22)";
                if (tr) {
                  trendLabel = tr.label;
                  if (tr.label.startsWith("+")) {
                    trendColor = GREEN;
                    trendBg = "rgba(52,199,89,.10)";
                    trendBorder = "rgba(52,199,89,.22)";
                    trendIconEl = <TrendingUp size={12} color={GREEN} strokeWidth={2.4} />;
                  } else if (tr.label.startsWith("-")) {
                    trendColor = RED;
                    trendBg = "rgba(255,59,48,.10)";
                    trendBorder = "rgba(255,59,48,.22)";
                    trendIconEl = <TrendingDown size={12} color={RED} strokeWidth={2.4} />;
                  } else {
                    trendColor = T3;
                    trendBg = "rgba(153,170,204,.12)";
                    trendBorder = "rgba(153,170,204,.22)";
                    trendIconEl = <Minus size={12} color={T3} strokeWidth={2.4} />;
                  }
                }

                return (
                  <div
                    key={t.id}
                    style={{
                      margin: "12px 20px 0",
                      background: "#fff",
                      borderRadius: 24,
                      overflow: "hidden",
                      boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 18px 44px rgba(10,132,255,.13)",
                      border: "0.5px solid rgba(10,132,255,.10)",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: 4,
                        background: accentFor(hasScoreData, t.avgScore),
                      }}
                    />

                    {/* Card top */}
                    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "17px 18px 15px 22px", borderBottom: `0.5px solid ${SEP}` }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 15,
                          background: avatarGradFor(t.name, hasScoreData, t.avgScore),
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 16,
                          fontWeight: 600,
                          color: "#fff",
                          flexShrink: 0,
                          boxShadow: avShadowFor(hasScoreData, t.avgScore),
                        }}
                      >
                        {initText}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: T1, letterSpacing: "-0.3px", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          {t.subjects.slice(0, 2).map((s, si) => {
                            const sst = subjectTagStyle(s);
                            return (
                              <span
                                key={si}
                                style={{
                                  padding: "4px 11px",
                                  borderRadius: 100,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  background: sst.bg,
                                  color: sst.color,
                                  border: sst.border,
                                }}
                              >
                                {s}
                              </span>
                            );
                          })}
                          {t.subjects.length > 2 && (
                            <span style={{ fontSize: 9, color: T4, fontWeight: 600 }}>+{t.subjects.length - 2}</span>
                          )}
                          {t.subjects.length === 0 && (
                            <span
                              style={{
                                padding: "4px 11px",
                                borderRadius: 100,
                                fontSize: 10,
                                fontWeight: 600,
                                background: "rgba(10,132,255,.10)",
                                color: B1,
                                border: "0.5px solid rgba(10,132,255,.20)",
                              }}
                            >
                              Teacher
                            </span>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#248A3D" }}>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: GREEN }} />
                            Active
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
                        <div
                          style={{
                            padding: "4px 10px",
                            borderRadius: 100,
                            background: t.classCount > 0 ? `linear-gradient(135deg, ${B1}, ${B2})` : "rgba(10,132,255,.10)",
                            border: t.classCount > 0 ? "none" : "0.5px solid rgba(10,132,255,.18)",
                            fontSize: 10,
                            fontWeight: 600,
                            color: t.classCount > 0 ? "#fff" : B1,
                            boxShadow: t.classCount > 0 ? "0 2px 7px rgba(10,132,255,.26)" : "none",
                          }}
                        >
                          {t.classCount} {t.classCount === 1 ? "Class" : "Classes"}
                        </div>
                        {hasScoreData && tr ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "4px 10px",
                              borderRadius: 100,
                              background: trendBg,
                              border: `0.5px solid ${trendBorder}`,
                              fontSize: 10,
                              fontWeight: 600,
                              color: trendColor,
                            }}
                          >
                            {trendIconEl}
                            {trendLabel}
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "4px 10px",
                              borderRadius: 100,
                              background: "rgba(255,149,0,.10)",
                              border: "0.5px solid rgba(255,149,0,.22)",
                              fontSize: 10,
                              fontWeight: 600,
                              color: "#86310C",
                            }}
                          >
                            No data yet
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metrics strip */}
                    <div style={{ display: "flex", borderBottom: `0.5px solid ${SEP}` }}>
                      {[
                        {
                          val: t.classCount > 0 ? t.classCount : "—",
                          lbl: "Classes",
                          color: t.classCount > 0 ? B1 : T4,
                        },
                        {
                          val: t.studentCount > 0 ? t.studentCount : "—",
                          lbl: "Students",
                          color: t.studentCount > 0 ? B1 : T4,
                        },
                        {
                          val: hasScoreData ? `${t.avgScore}%` : "—",
                          lbl: "Avg Score",
                          color: avgValColor,
                          sub: hasScoreData ? `Grade ${tLetter}` : null,
                        },
                        {
                          val: hasScoreData && tr ? tr.label : "—",
                          lbl: "Trend",
                          color: hasScoreData && tr ? trendColor : T4,
                          trendIcon: hasScoreData && tr ? trendIconEl : null,
                        },
                      ].map((m, mi) => (
                        <div
                          key={mi}
                          style={{
                            flex: 1,
                            padding: "12px 10px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            position: "relative",
                            borderRight: mi < 3 ? "0.5px solid rgba(10,132,255,.10)" : "none",
                          }}
                        >
                          {m.trendIcon ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              {m.trendIcon}
                              <div style={{ fontSize: 14, fontWeight: 600, color: m.color, letterSpacing: "-0.4px", lineHeight: 1 }}>
                                {m.val}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: 18, fontWeight: 600, color: m.color, letterSpacing: "-0.4px", lineHeight: 1 }}>
                              {m.val}
                            </div>
                          )}
                          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: T4 }}>
                            {m.lbl}
                          </div>
                          {m.sub && (
                            <div style={{ fontSize: 9, fontWeight: 600, color: T4, marginTop: 1 }}>{m.sub}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Progress bar (when scored) */}
                    {hasScoreData && (
                      <div style={{ padding: "10px 16px", borderBottom: `0.5px solid ${SEP}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: T4 }}>
                          <span>Class Performance</span>
                          <span style={{ color: avgValColor }}>{t.avgScore}%</span>
                        </div>
                        <div style={{ height: 8, background: "#EBEBF0", borderRadius: 4, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 4,
                              background: avgBarColor,
                              width: `${Math.min(100, Math.max(0, t.avgScore!))}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* vs School Avg row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "11px 18px",
                        borderBottom: `0.5px solid ${SEP}`,
                        background: "rgba(10,132,255,.03)",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: T3, display: "flex", alignItems: "center", gap: 6 }}>
                        <BarChart3 size={12} strokeWidth={2.3} />
                        vs School Avg{hasScoreData ? ` (${schoolAvg}%)` : ""}
                      </div>
                      {t.vsSchoolAvg != null ? (
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            color: t.vsSchoolAvg > 2 ? GREEN : t.vsSchoolAvg < -2 ? RED : GOLD,
                          }}
                        >
                          {t.vsSchoolAvg > 2 ? (
                            <TrendingUp size={12} strokeWidth={2.4} />
                          ) : t.vsSchoolAvg < -2 ? (
                            <TrendingDown size={12} strokeWidth={2.4} />
                          ) : (
                            <Minus size={12} strokeWidth={2.4} />
                          )}
                          <span>
                            {t.vsSchoolAvg >= 0 ? "+" : ""}
                            {t.vsSchoolAvg}%
                            {" "}
                            <span style={{ fontSize: 11, fontWeight: 600, color: T3 }}>
                              {t.vsSchoolAvg > 2 ? "Above" : t.vsSchoolAvg < -2 ? "Below" : "On Par"}
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 600, color: T4, display: "flex", alignItems: "center", gap: 5 }}>
                          —{" "}
                          <span style={{ fontSize: 11, color: T4, fontStyle: "italic", fontWeight: 500 }}>No data</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, padding: "13px 16px" }}>
                      <button
                        onClick={() => setSelected(t)}
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: `linear-gradient(135deg, ${B1}, ${B2})`,
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          boxShadow: "0 6px 22px rgba(10,132,255,.40), 0 2px 5px rgba(10,132,255,.20)",
                        }}
                      >
                        <ArrowRight size={13} strokeWidth={2.2} />
                        View Details
                      </button>
                      <button
                        onClick={() => navigate("/teacher-notes")}
                        style={{
                          flex: 1,
                          height: 40,
                          borderRadius: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          background: "#F5F5F7",
                          color: "#3A3A3C",
                          border: "0.5px solid rgba(10,132,255,.16)",
                          cursor: "pointer",
                          boxShadow: "0 0 0 .5px rgba(10,132,255,.08), 0 2px 8px rgba(10,132,255,.08)",
                        }}
                      >
                        <MessageSquare size={13} color="rgba(10,132,255,.6)" strokeWidth={2.2} />
                        Note
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* AI CARD */}
            {filtered.length > 0 && (
              <div
                style={{
                  margin: "12px 20px 0",
                  background: "linear-gradient(140deg,#0A84FF 0%,#0A84FF 48%,#0A84FF 100%)",
                  borderRadius: 22,
                  padding: "18px 20px",
                  boxShadow: "0 8px 28px rgba(0,51,204,.28), 0 0 0 .5px rgba(255,255,255,.14)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -34,
                    right: -22,
                    width: 140,
                    height: 140,
                    background: "radial-gradient(circle, rgba(255,255,255,.12) 0%, transparent 65%)",
                    borderRadius: "50%",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, position: "relative", zIndex: 1 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      background: "rgba(255,255,255,.18)",
                      border: "0.5px solid rgba(255,255,255,.26)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Sparkles size={13} color="rgba(255,255,255,.90)" strokeWidth={2.3} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,.55)" }}>
                    AI Performance Intelligence
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.85)", lineHeight: 1.72, position: "relative", zIndex: 1 }}>
                  {(() => {
                    const withData = filtered.filter((t) => t.avgScore != null);
                    const withoutData = filtered.filter((t) => t.avgScore == null);
                    const topT =
                      withData.length > 0
                        ? [...withData].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))[0]
                        : null;

                    if (withData.length === 0) {
                      return (
                        <>
                          No teacher has recorded score data yet.{" "}
                          <strong style={{ color: "#fff", fontWeight: 600 }}>
                            Schedule assessments
                          </strong>{" "}
                          to enable proper impact analysis across {filtered.length} teacher{filtered.length === 1 ? "" : "s"}.
                        </>
                      );
                    }
                    return (
                      <>
                        {topT && (
                          <>
                            <strong style={{ color: "#fff", fontWeight: 600 }}>{topT.name}</strong>{" "}
                            leads with{" "}
                            <strong style={{ color: "#fff", fontWeight: 600 }}>
                              {topT.avgScore}%
                            </strong>
                            {topT.subjects[0] ? ` in ${topT.subjects[0]}` : ""}.{" "}
                          </>
                        )}
                        School averages{" "}
                        <strong style={{ color: "#fff", fontWeight: 600 }}>{schoolAvg}%</strong>{" "}
                        across graded teachers.{" "}
                        {withoutData.length > 0 && (
                          <>
                            <strong style={{ color: "#fff", fontWeight: 600 }}>
                              {withoutData.length} teacher{withoutData.length === 1 ? "" : "s"}
                            </strong>{" "}
                            have no performance data — consider scheduling assessments to enable proper impact analysis.
                          </>
                        )}
                        {needsSupportCount > 0 && (
                          <>
                            {" "}
                            <strong style={{ color: "#FF6961", fontWeight: 600 }}>
                              {needsSupportCount} teacher{needsSupportCount === 1 ? "" : "s"}
                            </strong>{" "}
                            below 60% need support.
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 1,
                    background: "rgba(255,255,255,.12)",
                    borderRadius: 14,
                    overflow: "hidden",
                    position: "relative",
                    zIndex: 1,
                    marginTop: 12,
                  }}
                >
                  {[
                    { v: teachers.length, l: "Teachers", c: "#fff" },
                    { v: `${schoolAvg}%`, l: "School Avg", c: "#FFCC00" },
                    { v: needsSupportCount, l: "At Risk", c: needsSupportCount > 0 ? "#FF6961" : "#fff" },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "rgba(255,255,255,.08)", padding: "12px", textAlign: "center" }}>
                      <div style={{ fontSize: 19, fontWeight: 600, color: s.c, letterSpacing: "-0.5px", lineHeight: 1, marginBottom: 3 }}>
                        {s.v}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "rgba(255,255,255,.40)" }}>
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ height: 20 }} />
      </div>
    );
  }

  // Desktop derived stats
  const dTopPerformers = teachers.filter(t => (t.avgScore ?? 0) >= 80).length;
  const dNeedsSupport = teachers.filter(t => t.avgScore != null && t.avgScore < 60).length;
  const dFiltered = filtered;
  const dSchoolAvgTier = schoolAvg >= 80 ? { label: "Excellent", c: "#34C759", bg: "rgba(52,199,89,0.22)", bdr: "rgba(52,199,89,0.4)" }
    : schoolAvg >= 65 ? { label: "Strong", c: "#34C759", bg: "rgba(52,199,89,0.22)", bdr: "rgba(52,199,89,0.4)" }
    : schoolAvg >= 50 ? { label: "Average", c: "#FFCC00", bg: "rgba(255,204,0,0.22)", bdr: "rgba(255,204,0,0.4)" }
    : { label: "Weak", c: "#FF6961", bg: "rgba(255,59,48,0.22)", bdr: "rgba(255,59,48,0.4)" };

  return (
    <div data-sfpro className="pb-10 w-full px-2 animate-in fade-in duration-500" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Inter', sans-serif" }}>

      {/* Top toolbar */}
      <div className="flex items-start justify-between gap-4 pt-2 mb-5">
        <div className="min-w-0">
          <div className="text-[28px] font-semibold leading-tight tracking-[-0.7px] flex items-center gap-[12px]" style={{ color: "#1D1D1F" }}>
            <div className="w-9 h-9 rounded-[12px] flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #0A84FF, #3395FF)", boxShadow: "0 4px 12px rgba(10,132,255,0.32)" }}>
              <GraduationCap className="w-[19px] h-[19px] text-white" strokeWidth={2.4} />
            </div>
            Teacher Performance
          </div>
          <div className="text-[12px] font-normal mt-[8px] ml-[46px] flex items-center gap-[8px]" style={{ color: "#6E6E73" }}>
            <span>Impact Analysis</span>
            <span className="font-semibold" style={{ color: "#A1A1A6" }}>·</span>
            <span>Same Subject Across Teachers</span>
            <span className="font-semibold" style={{ color: "#A1A1A6" }}>·</span>
            <span>Same Teacher Across Classes</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(10,132,255,0.42)" }} strokeWidth={2.2} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search teacher or subject…"
              className="h-[42px] pl-10 pr-4 rounded-[12px] bg-white text-[13px] font-medium outline-none min-w-[280px]"
              style={{ color: "#1D1D1F", border: "0.5px solid rgba(10,132,255,0.14)", boxShadow: "0 0 0 .5px rgba(10,132,255,.08), 0 2px 8px rgba(10,132,255,.09)" }} />
          </div>
        </div>
      </div>

      {/* Dark hero banner */}
      <div className="rounded-[22px] px-6 py-5 relative overflow-hidden flex items-center justify-between gap-5 mb-4"
        style={{
          background: "linear-gradient(135deg, #1D1D1F 0%, #0A84FF 35%, #0A84FF 70%, #0A84FF 100%)",
          boxShadow: "0 8px 26px rgba(0,8,60,0.28), 0 0 0 0.5px rgba(255,255,255,0.12)",
        }}>
        <div className="absolute -top-12 -right-8 w-[180px] h-[180px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
        <div className="flex items-center gap-[12px] min-w-0 relative z-10">
          <div className="w-11 h-11 rounded-[13px] flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.24)" }}>
            <BarChart3 className="w-[22px] h-[22px]" style={{ color: "rgba(255,255,255,0.92)" }} strokeWidth={2.1} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-[4px]" style={{ color: "rgba(255,255,255,0.50)" }}>
              School Avg · {teachers.length} Teacher{teachers.length === 1 ? "" : "s"}
            </div>
            <div className="text-[28px] font-semibold text-white leading-none tracking-[-1px]">
              {loading ? "—" : `${schoolAvg}%`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 relative z-10">
          <div className="flex items-center gap-[4px] px-[16px] py-[8px] rounded-full"
            style={{ background: dSchoolAvgTier.bg, border: `0.5px solid ${dSchoolAvgTier.bdr}` }}>
            <span className="text-[12px] font-semibold" style={{ color: dSchoolAvgTier.c }}>{dSchoolAvgTier.label} tier</span>
          </div>
          <div className="grid grid-cols-3 gap-[1px] rounded-[13px] overflow-hidden" style={{ background: "rgba(255,255,255,0.12)" }}>
            {[
              { val: teachers.length, label: "Faculty", color: "#fff" },
              { val: dTopPerformers, label: "Top Tier", color: "#34C759" },
              { val: dNeedsSupport, label: "Support", color: dNeedsSupport > 0 ? "#FF6961" : "#FFCC00" },
            ].map(({ val, label, color }) => (
              <div key={label} className="py-[12px] px-[16px] text-center min-w-[72px]" style={{ background: "rgba(255,255,255,0.08)" }}>
                <div className="text-[18px] font-semibold leading-none mb-[4px]" style={{ color, letterSpacing: "-0.4px" }}>{val}</div>
                <div className="text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.40)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bright stat cards 4-wide */}
      {/* 4 Stat Cards — dashboard-style */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Total Teachers",
            val: teachers.length,
            sub: "In branch",
            Icon: Users,
            cardGrad: "linear-gradient(135deg, #EBEBF0 0%, #F5F5F7 100%)",
            tileGrad: "linear-gradient(135deg, #0A84FF, #3395FF)",
            tileShadow: "0 4px 14px rgba(10,132,255,0.28)",
            valColor: "#0A84FF",
            decorColor: "#0A84FF",
          },
          {
            label: "Avg Class Score",
            val: loading ? "—" : `${schoolAvg}%`,
            sub: dSchoolAvgTier.label,
            Icon: BarChart3,
            cardGrad: "linear-gradient(135deg, #E5D5FF 0%, #F5F5F7 100%)",
            tileGrad: "linear-gradient(135deg, #AF52DE, #AF52DE)",
            tileShadow: "0 4px 14px rgba(175,82,222,0.26)",
            valColor: "#AF52DE",
            decorColor: "#AF52DE",
          },
          {
            label: "Top Performers",
            val: dTopPerformers,
            sub: "Score ≥ 80%",
            Icon: Star,
            cardGrad: "linear-gradient(135deg, #F0F8F1 0%, #F0F8F1 100%)",
            tileGrad: "linear-gradient(135deg, #34C759, #34C759)",
            tileShadow: "0 4px 14px rgba(52,199,89,0.26)",
            valColor: "#248A3D",
            decorColor: "#34C759",
          },
          {
            label: "Needs Support",
            val: dNeedsSupport,
            sub: "Score < 60%",
            Icon: AlertTriangle,
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
              className="rounded-[20px] p-5 relative overflow-hidden"
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
              <span className="block text-[12px] font-semibold uppercase tracking-[0.10em] mb-1.5" style={{ color: "#A1A1A6" }}>{s.label}</span>
              <p className="text-[28px] font-semibold tracking-tight leading-none mb-1.5" style={{ color: s.valColor, letterSpacing: "-1.2px" }}>{s.val}</p>
              <p className="text-[12px] font-semibold truncate" style={{ color: "#6E6E73" }}>{s.sub}</p>
              <Icon
                className="absolute bottom-3 right-3 w-14 h-14 pointer-events-none"
                style={{ color: s.decorColor, opacity: 0.18 }}
                strokeWidth={2}
              />
            </div>
          );
        })}
      </div>

      {/* Section label */}
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] mb-3" style={{ color: "#A1A1A6" }}>
        Faculty Performance Roster
        <span className="px-[12px] py-[4px] rounded-full text-[12px] font-semibold ml-1"
          style={{ background: "rgba(10,132,255,0.10)", color: "#0A84FF", border: "0.5px solid rgba(10,132,255,0.16)" }}>
          {dFiltered.length} {dFiltered.length === 1 ? "teacher" : "teachers"}
        </span>
        <div className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
      </div>

      {/* Teacher table */}
      {loading ? (
        <div className="rounded-[22px] py-10 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <Loader2 className="w-9 h-9 animate-spin mx-auto mb-3" style={{ color: "#0A84FF" }} />
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#A1A1A6" }}>Loading teacher performance…</p>
        </div>
      ) : dFiltered.length === 0 ? (
        <div className="rounded-[22px] py-10 text-center bg-white"
          style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <div className="w-16 h-16 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{ background: "rgba(10,132,255,0.08)", border: "0.5px solid rgba(10,132,255,0.14)" }}>
            <GraduationCap className="w-7 h-7" style={{ color: "rgba(10,132,255,0.45)" }} strokeWidth={2} />
          </div>
          <p className="text-[13px] font-semibold mb-1" style={{ color: "#1D1D1F" }}>No teacher data found</p>
          <p className="text-[12px]" style={{ color: "#A1A1A6" }}>{search ? "Try a different search term." : "Assign teachers to classes to see performance."}</p>
        </div>
      ) : (
        <div className="rounded-[22px] bg-white overflow-hidden"
          style={{ boxShadow: "0 0 0 .5px rgba(10,132,255,.10), 0 4px 16px rgba(10,132,255,.11), 0 16px 40px rgba(10,132,255,.13)", border: "0.5px solid rgba(10,132,255,0.10)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead>
                <tr style={{ background: "rgba(10,132,255,0.04)", borderBottom: "0.5px solid rgba(10,132,255,0.07)" }}>
                  {["Teacher", "Subjects", "Classes", "Students", "Avg Score", "vs School", "Trend", ""].map(h => (
                    <th key={h} className="py-[16px] px-5 text-[12px] font-semibold uppercase tracking-[0.10em]" style={{ color: "#A1A1A6" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dFiltered.map((t, i, arr) => {
                  const T = trend(t);
                  const TIcon = T?.icon;
                  const g = t.avgScore != null ? grade(t.avgScore) : "—";
                  const scoreColor = t.avgScore == null ? "#A1A1A6" : t.avgScore >= 80 ? "#34C759" : t.avgScore >= 60 ? "#0A84FF" : t.avgScore >= 40 ? "#FF9500" : "#FF3B30";
                  const gradeStyle = g === "A" ? { bg: "rgba(52,199,89,0.10)", c: "#248A3D", bdr: "rgba(52,199,89,0.22)" }
                    : g === "B" ? { bg: "rgba(10,132,255,0.10)", c: "#0A84FF", bdr: "rgba(10,132,255,0.22)" }
                    : g === "C" ? { bg: "rgba(255,204,0,0.10)", c: "#86310C", bdr: "rgba(255,204,0,0.22)" }
                    : { bg: "rgba(255,59,48,0.10)", c: "#FF3B30", bdr: "rgba(255,59,48,0.22)" };
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-[#F5F5F7]"
                      style={i < arr.length - 1 ? { borderBottom: "0.5px solid rgba(10,132,255,0.05)" } : {}}>
                      <td className="py-[16px] px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-[11px] flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0"
                            style={{ background: "linear-gradient(135deg, #3395FF, #5BA9FF)", boxShadow: "0 3px 10px rgba(10,132,255,0.24)" }}>
                            {t.name.substring(0, 2).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-semibold tracking-[-0.2px]" style={{ color: "#1D1D1F" }}>{t.name}</span>
                        </div>
                      </td>
                      <td className="py-[16px] px-5">
                        <div className="flex flex-wrap gap-[4px]">
                          {t.subjects.slice(0, 2).map(s => (
                            <span key={s} className="text-[12px] font-semibold px-[12px] py-[4px] rounded-full"
                              style={{ background: "rgba(10,132,255,0.10)", color: "#0A84FF", border: "0.5px solid rgba(10,132,255,0.18)" }}>{s}</span>
                          ))}
                          {t.subjects.length > 2 && <span className="text-[12px] font-semibold self-center" style={{ color: "#A1A1A6" }}>+{t.subjects.length - 2}</span>}
                          {t.subjects.length === 0 && <span className="text-[12px]" style={{ color: "#A1A1A6" }}>—</span>}
                        </div>
                      </td>
                      <td className="py-[16px] px-5 text-[12px] font-semibold" style={{ color: "#6E6E73" }}>{t.classCount || "—"}</td>
                      <td className="py-[16px] px-5 text-[12px] font-semibold" style={{ color: "#6E6E73" }}>{t.studentCount || "—"}</td>
                      <td className="py-[16px] px-5">
                        {t.avgScore != null ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold" style={{ color: scoreColor, letterSpacing: "-0.2px" }}>{t.avgScore}%</span>
                            <span className="px-[8px] py-[2px] rounded-full text-[12px] font-semibold"
                              style={{ background: gradeStyle.bg, color: gradeStyle.c, border: `0.5px solid ${gradeStyle.bdr}` }}>{g}</span>
                          </div>
                        ) : <span className="text-[12px]" style={{ color: "#A1A1A6" }}>No data</span>}
                      </td>
                      <td className="py-[16px] px-5">
                        {t.vsSchoolAvg != null ? (
                          <span className="text-[12px] font-semibold" style={{ color: t.vsSchoolAvg >= 0 ? "#34C759" : "#FF3B30" }}>
                            {t.vsSchoolAvg >= 0 ? "+" : ""}{t.vsSchoolAvg}%
                          </span>
                        ) : <span className="text-[12px]" style={{ color: "#A1A1A6" }}>—</span>}
                      </td>
                      <td className="py-[16px] px-5">
                        {T && TIcon ? (
                          <div className="flex items-center gap-[4px]">
                            <TIcon className={`w-[14px] h-[14px] ${T.color}`} strokeWidth={2.3} />
                            <span className={`text-[12px] font-semibold ${T.color}`}>{T.label}</span>
                          </div>
                        ) : <span className="text-[12px]" style={{ color: "#A1A1A6" }}>—</span>}
                      </td>
                      <td className="py-[16px] px-5">
                        <button onClick={() => setSelected(t)}
                          className="h-8 px-[12px] rounded-[10px] flex items-center gap-[4px] text-[12px] font-semibold text-white transition-transform active:scale-95 hover:scale-[1.03] relative overflow-hidden"
                          style={{ background: "linear-gradient(135deg, #0A84FF, #3395FF)", boxShadow: "0 3px 10px rgba(10,132,255,0.26)" }}>
                          <span className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                          <span className="relative z-10">View</span>
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
      )}

    </div>
  );
};

export default TeacherPerformance;
