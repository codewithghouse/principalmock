import { useState, useEffect, useRef } from "react";
import {
  CalendarCheck, Star, Users, Search, List,
  Plus, Upload, Download, FileSpreadsheet, CheckCircle,
  Loader2, GraduationCap, Eye, Trash2, Edit3, Save,
  TrendingUp, MessageSquare, LayoutGrid, MoreHorizontal, BookOpen, MapPin
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";
import TeacherProfile from "@/components/TeacherProfile";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, serverTimestamp, query, where,
  onSnapshot, doc, updateDoc, getDocs
} from "firebase/firestore";
import { sendEmail } from "@/lib/resend";
import { useAuth } from "@/lib/AuthContext";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────
interface BulkTeacher {
  name: string;
  email: string;
  subject?: string;
  phone?: string;
  experience?: string;
  _status?: "pending" | "success" | "error" | "duplicate";
  _error?: string;
}

const TEMPLATE_DATA = [
  { Name: "Mrs. Kavita Sharma", Email: "kavita@example.com", Subject: "Mathematics", Phone: "9876543210", Experience: "5 years" },
  { Name: "Dr. Rajesh Kumar",   Email: "rajesh@example.com", Subject: "Physics",     Phone: "9876543211", Experience: "8 years" },
];

// ═══════════════════════════════════════════════════════════════════════
// MOCK DATA — flip USE_MOCK_DATA to false to restore live Firestore data
// ═══════════════════════════════════════════════════════════════════════
const USE_MOCK_DATA = true;

const _T_COLORS = [
  "bg-[#1D1D1F]", "bg-emerald-600", "bg-amber-500",
  "bg-rose-500",  "bg-indigo-600",  "bg-teal-600",
];
const _initials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

// 12 classes (same roster as ClassesSections + Dashboard)
const MOCK_AVAILABLE_CLASSES: any[] = [
  { id: "cls-6a",  name: "Grade 6A",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-6b",  name: "Grade 6B",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-7a",  name: "Grade 7A",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-7b",  name: "Grade 7B",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-7c",  name: "Grade 7C",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-8a",  name: "Grade 8A",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-8b",  name: "Grade 8B",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-8c",  name: "Grade 8C",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-9a",  name: "Grade 9A",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-9b",  name: "Grade 9B",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-10a", name: "Grade 10A", schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-10b", name: "Grade 10B", schoolId: "mock-school-001", branchId: "mock-branch-001" },
];

// 17 teachers — 12 class teachers + Aarav's 6 subject specialists. Each with
// full enriched fields (initials, color, classCount, classNames, rating, etc).
const _T_RAW = [
  // ── 12 Class Teachers (one per section) ──
  { id: "t-vandana", name: "Mrs. Vandana Singh",  subject: "Mathematics",      email: "vandana.singh@school.edu",   phone: "+91 98765 22001", experience: "12 years", rating: "4.6", status: "Active", classes: ["cls-6a"]  },
  { id: "t-rohit",   name: "Mr. Rohit Mishra",    subject: "Science",          email: "rohit.mishra@school.edu",    phone: "+91 98765 22002", experience: "8 years",  rating: "4.2", status: "Active", classes: ["cls-6b"]  },
  { id: "t-meena",   name: "Mrs. Meena Kapoor",   subject: "English",          email: "meena.kapoor@school.edu",    phone: "+91 98765 22003", experience: "15 years", rating: "4.7", status: "Active", classes: ["cls-7a"]  },
  { id: "t-arjun",   name: "Mr. Arjun Bhatt",     subject: "Social Studies",   email: "arjun.bhatt@school.edu",     phone: "+91 98765 22004", experience: "6 years",  rating: "4.3", status: "Active", classes: ["cls-7b"]  },
  { id: "t-deepa",   name: "Mrs. Deepa Nair",     subject: "Hindi",            email: "deepa.nair@school.edu",      phone: "+91 98765 22005", experience: "10 years", rating: "4.4", status: "Active", classes: ["cls-7c"]  },
  { id: "t-sandeep", name: "Mr. Sandeep Joshi",   subject: "Physical Education", email: "sandeep.joshi@school.edu", phone: "+91 98765 22006", experience: "9 years",  rating: "4.5", status: "Active", classes: ["cls-8a"]  },
  { id: "t-priya",   name: "Mrs. Priya Mehta",    subject: "Mathematics",      email: "priya.mehta@school.edu",     phone: "+91 98765 22007", experience: "14 years", rating: "4.9", status: "Active", classes: ["cls-8b"]  }, // ⭐ Aarav's class teacher — top rated
  { id: "t-suresh",  name: "Mr. Suresh Kulkarni", subject: "Mathematics",      email: "suresh.kulkarni@school.edu", phone: "+91 98765 22008", experience: "7 years",  rating: "4.1", status: "Active", classes: ["cls-8c"]  },
  { id: "t-anita",   name: "Mrs. Anita Choudhury",subject: "Biology",          email: "anita.choudhury@school.edu", phone: "+91 98765 22009", experience: "13 years", rating: "4.6", status: "Active", classes: ["cls-9a"]  },
  { id: "t-vikash",  name: "Mr. Vikash Kumar",    subject: "Chemistry",        email: "vikash.kumar@school.edu",    phone: "+91 98765 22010", experience: "11 years", rating: "4.5", status: "Active", classes: ["cls-9b"]  },
  { id: "t-rashmi",  name: "Mrs. Rashmi Pandey",  subject: "Physics",          email: "rashmi.pandey@school.edu",   phone: "+91 98765 22011", experience: "16 years", rating: "4.8", status: "Active", classes: ["cls-10a"] },
  { id: "t-faisal",  name: "Mr. Faisal Ahmed",    subject: "Mathematics",      email: "faisal.ahmed@school.edu",    phone: "+91 98765 22012", experience: "9 years",  rating: "4.4", status: "Active", classes: ["cls-10b"] },
  // ── 5 Subject specialists (visit Aarav's class 8B + others) ──
  { id: "t-kiran",   name: "Mr. Kiran Patel",     subject: "English",          email: "kiran.patel@school.edu",     phone: "+91 98765 22013", experience: "11 years", rating: "4.7", status: "Active", classes: ["cls-8b", "cls-8a", "cls-8c"] },
  { id: "t-sunita",  name: "Mrs. Sunita Verma",   subject: "Hindi",            email: "sunita.verma@school.edu",    phone: "+91 98765 22014", experience: "18 years", rating: "4.5", status: "Active", classes: ["cls-8b", "cls-8a", "cls-9a"] },
  { id: "t-anil",    name: "Dr. Anil Reddy",      subject: "Science",          email: "anil.reddy@school.edu",      phone: "+91 98765 22015", experience: "15 years", rating: "4.8", status: "Active", classes: ["cls-8b", "cls-8c"] },
  { id: "t-rahul",   name: "Mr. Rahul Khanna",    subject: "Social Studies",   email: "rahul.khanna@school.edu",    phone: "+91 98765 22016", experience: "8 years",  rating: "4.3", status: "Active", classes: ["cls-8b", "cls-9a", "cls-9b"] },
  { id: "t-neha",    name: "Ms. Neha Iyer",       subject: "Computer Science", email: "neha.iyer@school.edu",       phone: "+91 98765 22017", experience: "5 years",  rating: "4.6", status: "Active", classes: ["cls-8b", "cls-7a", "cls-9b", "cls-10a"] },
];

const _classNameById = Object.fromEntries(MOCK_AVAILABLE_CLASSES.map(c => [c.id, c.name]));

const MOCK_TEACHERS_DATA: any[] = _T_RAW.map((t, i) => {
  const classIds = t.classes;
  const classNames = classIds.map(id => _classNameById[id]).filter(Boolean).join(", ") || "Unassigned";
  return {
    id: t.id,
    name: t.name, subject: t.subject, email: t.email, phone: t.phone, experience: t.experience, rating: t.rating, status: t.status,
    schoolId: "mock-school-001", branchId: "mock-branch-001",
    initials: _initials(t.name),
    color: _T_COLORS[i % _T_COLORS.length],
    classCount: classIds.length,
    classNames,
  };
});

// Aggregate stats
const MOCK_AVG_RATING   = Math.round((_T_RAW.reduce((s, t) => s + Number(t.rating), 0) / _T_RAW.length) * 10) / 10; // ~4.5
const MOCK_REVIEW_COUNT = 218;
const MOCK_AVG_CLASS_PERF = 78.5;
const MOCK_TEACHER_ATT_PCT = 96;

// ─── Component ────────────────────────────────────────────────────────────────
const Teachers = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── UI State ─────────────────────────────────────────────────────────────
  const [teachersData,     setTeachersData]     = useState<any[]>(USE_MOCK_DATA ? MOCK_TEACHERS_DATA : []);
  const [selectedTeacher,  setSelectedTeacher]  = useState<any | null>(null);
  const [searchQuery,      setSearchQuery]      = useState("");
  const [subjectFilter,    setSubjectFilter]    = useState("");
  const [statusFilter,     setStatusFilter]     = useState("");
  const [viewMode,         setViewMode]         = useState<"grid" | "list">("grid");

  // ── Dialog State ──────────────────────────────────────────────────────────
  const [isInviteOpen,       setIsInviteOpen]       = useState(false);
  const [isBulkOpen,         setIsBulkOpen]         = useState(false);
  const [isRosterOpen,       setIsRosterOpen]       = useState(false);
  const [teacherToAssign,    setTeacherToAssign]    = useState<any | null>(null);
  const [teacherRoster,      setTeacherRoster]      = useState<any[]>([]);
  const [loadingRoster,      setLoadingRoster]      = useState(false);
  const [isSending,          setIsSending]          = useState(false);

  // ── Edit State ────────────────────────────────────────────────────────────
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editName,   setEditName]   = useState("");

  // ── Bulk State ────────────────────────────────────────────────────────────
  const [bulkData,         setBulkData]         = useState<BulkTeacher[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkDone,         setBulkDone]         = useState(false);

  const [inviteForm,       setInviteForm]       = useState({ name: "", email: "", subject: "", assignClassId: "" });
  const [availableClasses, setAvailableClasses] = useState<any[]>(USE_MOCK_DATA ? MOCK_AVAILABLE_CLASSES : []);
  const availableClassesRef = useRef<any[]>(USE_MOCK_DATA ? MOCK_AVAILABLE_CLASSES : []); // ref so onSnapshot closures see latest value

  // ── Aggregated Stats State ────────────────────────────────────────────────
  const [avgRating,       setAvgRating]       = useState<number | null>(USE_MOCK_DATA ? MOCK_AVG_RATING : null);
  const [reviewCount,     setReviewCount]     = useState(USE_MOCK_DATA ? MOCK_REVIEW_COUNT : 0);
  const [avgClassPerf,    setAvgClassPerf]    = useState<number | null>(USE_MOCK_DATA ? MOCK_AVG_CLASS_PERF : null);
  const [teacherAttPct,   setTeacherAttPct]   = useState<number | null>(USE_MOCK_DATA ? MOCK_TEACHER_ATT_PCT : null);

  // ── Teacher Real-time Fetch ───────────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK_DATA) return; // Mock mode: teachersData + availableClasses pre-seeded above
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;

    const constraints: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) constraints.push(where("branchId", "==", branchId));

    const q = query(collection(db, "teachers"), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      const COLORS = [
        "bg-[#1D1D1F]", "bg-emerald-600", "bg-amber-500",
        "bg-rose-500",  "bg-indigo-600",  "bg-teal-600",
      ];
      const teachers = snap.docs.map((d, i) => {
        const data = d.data();
        return {
          id:          d.id,
          ...data,
          initials:    data.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) || "T",
          color:       COLORS[i % COLORS.length],
          experience:  data.experience  || "N/A",
          rating:      data.rating      || "5.0",
          status:      data.status      || "Active",
          subject:     data.subject     || "Faculty",
          classCount:  null as number | null,   // filled async below
          classNames:  "Fetching…",
        };
      });
      setTeachersData(teachers);

      // ONE batch fetch for all teaching_assignments, then join in memory.
      // Replaces the previous N+1 pattern (one getDocs + one getDoc per teacher).
      getDocs(query(collection(db, "teaching_assignments"), ...constraints))
        .then(taSnap => {
          const allAssignments = taSnap.docs.map(d => ({ ...d.data(), id: d.id }));
          const classMap = new Map(
            availableClassesRef.current.map((c: any) => [c.id as string, c.name as string])
          );
          setTeachersData(prev => prev.map(t => {
            const tAssignments = allAssignments.filter((a: any) => a.teacherId === t.id);
            const classIds = [...new Set(tAssignments.map((a: any) => a.classId).filter(Boolean))];
            if (classIds.length === 0) return { ...t, classCount: 0, classNames: "Unassigned" };
            const names = classIds.map(id => classMap.get(id as string) || "").filter(Boolean);
            return {
              ...t,
              classCount: classIds.length,
              classNames: names.join(", ") || "No Classes",
              subject: t.subject || (tAssignments[0] as any)?.subjectId || "Faculty",
            };
          }));
        })
        .catch(() => {});
    });

    const classConstraints: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) classConstraints.push(where("branchId", "==", branchId));
    const unsubClasses = onSnapshot(
      query(collection(db, "classes"), ...classConstraints),
      (snap) => {
        const cls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        availableClassesRef.current = cls;
        setAvailableClasses(cls);
      }
    );

    return () => { unsub(); unsubClasses(); };
  }, [userData]);

  // ── Avg Class Performance (from results) ─────────────────────────────────
  useEffect(() => {
    if (USE_MOCK_DATA) return; // Mock mode: avgClassPerf pre-seeded above
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;
    const c: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) c.push(where("branchId", "==", branchId));
    const unsub = onSnapshot(
      query(collection(db, "results"), ...c),
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        if (docs.length === 0) { setAvgClassPerf(null); return; }
        const avg = docs.reduce((s, d) => {
          const pct = d.totalMarks > 0 ? (d.marksObtained / d.totalMarks) * 100 : 0;
          return s + pct;
        }, 0) / docs.length;
        setAvgClassPerf(Math.round(avg * 10) / 10);
      }
    );
    return () => unsub();
  }, [userData]);

  // ── Teacher Attendance % ─────────────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK_DATA) return; // Mock mode: teacherAttPct pre-seeded above
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;
    const c: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) c.push(where("branchId", "==", branchId));
    const unsub = onSnapshot(
      query(collection(db, "teacher_attendance"), ...c),
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        if (docs.length === 0) { setTeacherAttPct(null); return; }
        const present = docs.filter(d => d.status === "present").length;
        setTeacherAttPct(Math.round((present / docs.length) * 100));
      }
    );
    return () => unsub();
  }, [userData]);

  // ── Parent Reviews Aggregate ─────────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK_DATA) return; // Mock mode: avgRating + reviewCount pre-seeded above
    if (!userData) return;
    const schoolId = userData?.schoolId || userData?.school || userData?.schoolID;
    const branchId = userData?.branchId || "";
    if (!schoolId) return;
    const c: any[] = [where("schoolId", "==", schoolId)];
    if (branchId) c.push(where("branchId", "==", branchId));
    const unsub = onSnapshot(
      query(collection(db, "teacher_reviews"), ...c),
      (snap) => {
        const docs = snap.docs.map(d => d.data());
        setReviewCount(docs.length);
        if (docs.length > 0) {
          const avg = docs.reduce((s, d) => s + (d.rating || 0), 0) / docs.length;
          setAvgRating(Math.round(avg * 10) / 10);
        }
      }
    );
    return () => unsub();
  }, [userData]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.name || !inviteForm.email) return;

    const assignToClass = async (teacherId: string, classId: string) => {
      if (!classId) return;
      await addDoc(collection(db, "teaching_assignments"), {
        teacherId, classId,
        schoolId: userData?.schoolId || "",
        branchId: userData?.branchId || "",
        subjectId: inviteForm.subject || "",
        status: "active",
        createdAt: serverTimestamp(),
      });
    };

    setIsSending(true);
    try {
      const emailObj = inviteForm.email.toLowerCase().trim();
      const schoolId = userData?.schoolId || userData?.school || "";
      const branchId = userData?.branchId || "";

      const qCheck = query(collection(db, "teachers"),
        where("email", "==", emailObj), where("schoolId", "==", schoolId));
      const snap = await getDocs(qCheck);

      if (!snap.empty) {
        const existing = snap.docs[0];
        if (existing.data().status === "Archived") {
          await updateDoc(doc(db, "teachers", existing.id), {
            status: "Invited", isActive: true,
            name: inviteForm.name,
            subject: inviteForm.subject || existing.data().subject,
            reactivatedAt: serverTimestamp(),
          });
          await assignToClass(existing.id, inviteForm.assignClassId);
          try {
            await sendEmail({
              to: emailObj,
              subject: `Welcome Back to ${userData?.schoolName || "Edullent"}`,
              html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#1D1D1F">Welcome Back, ${inviteForm.name}!</h2><p>Your account has been restored at <strong>${userData?.schoolName || "the institution"}</strong>.</p><div style="margin:24px 0"><a href="https://teacher-dashboard-ochre.vercel.app" style="background:#1D1D1F;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Open Teacher Dashboard</a></div></div>`,
            });
          } catch (emailErr: any) {
            toast.warning(`Teacher restored, but email failed: ${emailErr?.message || "Unknown error"}`);
          }
          toast.success("Teacher restored & re-invited!");
        } else {
          toast.error("A teacher with this email is already active.");
        }
        setIsInviteOpen(false);
        setInviteForm({ name: "", email: "", subject: "", assignClassId: "" });
        setIsSending(false);
        return;
      }

      const ref = await addDoc(collection(db, "teachers"), {
        name: inviteForm.name, subject: inviteForm.subject,
        email: emailObj, schoolId, branchId,
        status: "Invited", isActive: true,
        createdAt: serverTimestamp(), rating: 5.0, experience: "N/A",
      });
      await assignToClass(ref.id, inviteForm.assignClassId);
      try {
        await sendEmail({
          to: emailObj,
          subject: `Invitation to join ${userData?.schoolName || "Edullent"}`,
          html: `<div style="font-family:sans-serif;padding:20px"><h2 style="color:#1D1D1F">Welcome, ${inviteForm.name}!</h2><p>You have been invited to <strong>${userData?.schoolName || "the institution"}</strong>.</p><div style="margin:24px 0"><a href="https://teacher-dashboard-ochre.vercel.app" style="background:#1D1D1F;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold">Login to Teacher Portal</a></div></div>`,
        });
        toast.success("Teacher invited & email sent successfully!");
      } catch (emailErr: any) {
        toast.warning(`Teacher added to system, but email failed: ${emailErr?.message || "Unknown error"}`);
      }
      setIsInviteOpen(false);
      setInviteForm({ name: "", email: "", subject: "", assignClassId: "" });
    } catch (err) {
      toast.error("Failed to invite teacher.");
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteTeacher = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from the system? Their records stay intact.`)) return;
    try {
      await updateDoc(doc(db, "teachers", id), {
        status: "Archived", isActive: false, archivedAt: serverTimestamp(),
      });
      const aSnap = await getDocs(
        query(collection(db, "teaching_assignments"), where("teacherId", "==", id))
      );
      await Promise.all(aSnap.docs.map(d => updateDoc(d.ref, { teacherId: null })));
      toast.success("Teacher archived successfully.");
    } catch {
      toast.error("Failed to archive teacher.");
    }
  };

  const handleStartEdit = (t: any) => { setEditingId(t.id); setEditName(t.name); };
  const handleSaveName  = async (id: string) => {
    if (!editName.trim()) return setEditingId(null);
    try {
      await updateDoc(doc(db, "teachers", id), { name: editName.trim() });
      toast.success("Name updated.");
      setEditingId(null);
    } catch { toast.error("Failed to update name."); }
  };

  // Toggle primary-school flag. A teacher who works at multiple schools logs in
  // to the school they marked as primary by default.
  const handleTogglePrimary = async (teacher: any) => {
    try {
      await updateDoc(doc(db, "teachers", teacher.id), {
        isPrimarySchool: !teacher.isPrimarySchool,
      });
      toast.success(
        teacher.isPrimarySchool
          ? "Removed as primary school."
          : "Marked as teacher's primary school.",
      );
    } catch {
      toast.error("Failed to update primary-school flag.");
    }
  };

  const handleOpenRoster = async (teacher: any) => {
    setTeacherToAssign(teacher);
    setIsRosterOpen(true);
    setLoadingRoster(true);
    try {
      const snap = await getDocs(
        query(collection(db, "enrollments"), where("teacherId", "==", teacher.id))
      );
      setTeacherRoster(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to fetch roster."); }
    finally { setLoadingRoster(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb   = XLSX.read(bstr, { type: "binary" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws) as any[];
      setBulkData(
        data.map(item => ({
          name:       item.Name       || item.name       || "",
          email:      (item.Email     || item.email      || "").toString().toLowerCase().trim(),
          subject:    item.Subject    || item.subject    || "",
          phone:      item.Phone      || item.phone      || "",
          experience: item.Experience || item.experience || "",
          _status:    "pending" as const,
        })).filter(t => !!t.email)
      );
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkImport = async () => {
    setIsBulkProcessing(true);
    const rows = [...bulkData];
    const schoolId = userData?.schoolId || "";
    const branchId = userData?.branchId || "";
    for (let i = 0; i < rows.length; i++) {
      try {
        const t = rows[i];
        const existing = await getDocs(
          query(collection(db, "teachers"), where("email", "==", t.email), where("schoolId", "==", schoolId))
        );
        if (!existing.empty) { rows[i]._status = "duplicate"; continue; }
        await addDoc(collection(db, "teachers"), {
          name: t.name, email: t.email, subject: t.subject,
          phone: t.phone, experience: t.experience,
          schoolId, branchId, status: "Invited",
          createdAt: serverTimestamp(), rating: 5.0,
        });
        // Send invite email — don't let failure break the bulk import
        sendEmail({
          to: t.email,
          subject: `Invitation to join ${userData?.schoolName || "Edullent"}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:0;border:1px solid #EBEBF0;border-radius:12px;overflow:hidden;">
              <div style="background:#1D1D1F;padding:24px 28px;">
                <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">EDULLENT</h1>
                <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Teacher Dashboard Invitation</p>
              </div>
              <div style="padding:28px;background:#fff;">
                <h2 style="color:#1D1D1F;margin:0 0 12px;">Welcome, ${t.name}!</h2>
                <p style="color:#6E6E73;font-size:14px;line-height:1.6;margin:0 0 8px;">
                  You have been invited to join <strong>${userData?.schoolName || "Edullent"}</strong> as a
                  <strong>${t.subject ? `${t.subject} Teacher` : "Teacher"}</strong>.
                </p>
                <p style="color:#6E6E73;font-size:14px;line-height:1.6;margin:0 0 24px;">
                  Log in with this email address to access your dashboard.
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="https://teacher-dashboard-ochre.vercel.app"
                     style="background:#1D1D1F;color:#fff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
                    Open Teacher Dashboard
                  </a>
                </div>
              </div>
              <div style="background:#F5F5F7;padding:14px 28px;text-align:center;">
                <p style="color:#A1A1A6;font-size:11px;margin:0;">Powered by Edullent Cloud Architecture</p>
              </div>
            </div>
          `,
        }).catch(() => {}); // fire-and-forget — don't block row status
        rows[i]._status = "success";
      } catch (err) {
        rows[i]._status = "error";
        rows[i]._error  = String(err);
      }
      setBulkData([...rows]);
    }
    setIsBulkProcessing(false);
    setBulkDone(true);
    toast.success("Bulk import complete");
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TeachersTemplate");
    XLSX.writeFile(wb, "Teacher_Import_Template.xlsx");
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const allSubjects = [...new Set(teachersData.map(t => t.subject).filter(Boolean))];
  const filtered = teachersData.filter(t =>
    t.status !== "Archived" &&
    (t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     t.email?.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!subjectFilter || t.subject === subjectFilter) &&
    (!statusFilter  || t.status  === statusFilter)
  );

  const activeCount  = teachersData.filter(t => t.status === "Active").length;
  const totalCount   = teachersData.filter(t => t.status !== "Archived").length;
  const onLeaveCount = teachersData.filter(t => t.status === "On Leave").length;

  // ── If profile is open, render it ────────────────────────────────────────
  if (selectedTeacher) {
    return <TeacherProfile teacher={selectedTeacher} onBack={() => setSelectedTeacher(null)} />;
  }

  /* ═══════════════════════════════════════════════════════════════
     MOBILE — Bright Blue Apple UI
     ═══════════════════════════════════════════════════════════════ */
  if (isMobile) {
    const B1 = "#0A84FF", B2 = "#3395FF", B4 = "#7CBBFF";
    const BG = "#F5F5F7", BG2 = "#EBEBF0";
    const T1 = "#1D1D1F", T2 = "#3A3A3C", T3 = "#6E6E73", T4 = "#A1A1A6";
    const SEP = "rgba(10,132,255,0.07)";
    const GREEN = "#34C759", GREEN_D = "#248A3D", GREEN_S = "rgba(52,199,89,0.10)", GREEN_B = "rgba(52,199,89,0.22)";
    const RED = "#FF3B30", RED_S = "rgba(255,59,48,0.10)", RED_B = "rgba(255,59,48,0.22)";
    const ORANGE = "#FF9500";
    const GOLD = "#FFCC00";
    const SH = "0 0 0 0.5px rgba(10,132,255,0.08), 0 2px 8px rgba(10,132,255,0.08), 0 10px 26px rgba(10,132,255,0.10)";
    const SH_LG = "0 0 0 0.5px rgba(10,132,255,0.10), 0 4px 16px rgba(10,132,255,0.11), 0 18px 44px rgba(10,132,255,0.13)";
    const SH_BTN = "0 6px 22px rgba(10,132,255,0.40), 0 2px 5px rgba(10,132,255,0.20)";

    // Avatar gradient mapping (from existing tailwind color classes)
    const avatarGradient = (color: string) => {
      if (color?.includes("emerald"))  return { bg: `linear-gradient(135deg, ${GREEN}, #34C759)`,       shadow: "0 4px 14px rgba(52,199,89,0.28)" };
      if (color?.includes("amber"))    return { bg: `linear-gradient(135deg, ${ORANGE}, #FFCC00)`,       shadow: "0 4px 14px rgba(255,149,0,0.28)" };
      if (color?.includes("rose"))     return { bg: `linear-gradient(135deg, ${RED}, #FF6961)`,           shadow: "0 4px 14px rgba(255,59,48,0.28)" };
      if (color?.includes("indigo"))   return { bg: "linear-gradient(135deg, #5B6FD4, #8A9AF0)",          shadow: "0 4px 14px rgba(91,111,212,0.28)" };
      if (color?.includes("teal"))     return { bg: "linear-gradient(135deg, #5AC8FA, #5AC8FA)",          shadow: "0 4px 14px rgba(90,200,250,0.24)" };
      return                             { bg: `linear-gradient(135deg, ${B1}, ${B2})`,                 shadow: "0 4px 14px rgba(10,132,255,0.28)" };
    };
    const accentBar = (color: string) => {
      if (color?.includes("emerald")) return `linear-gradient(180deg, ${GREEN}, #34C759)`;
      if (color?.includes("amber"))   return `linear-gradient(180deg, ${ORANGE}, #FFCC00)`;
      if (color?.includes("rose"))    return `linear-gradient(180deg, ${RED}, #FF6961)`;
      return `linear-gradient(180deg, ${B1}, ${B4})`;
    };

    // Status chip
    const statusChip = (status: string) => {
      if (status === "Active")   return { bg: GREEN_S,                       color: GREEN_D, border: GREEN_B,                         dotColor: GREEN };
      if (status === "On Leave") return { bg: "rgba(255,149,0,0.10)",         color: "#86310C", border: "rgba(255,149,0,0.22)",         dotColor: ORANGE };
      if (status === "Invited")  return { bg: "rgba(10,132,255,0.10)",          color: B1,       border: "rgba(10,132,255,0.20)",           dotColor: B1 };
      return                     { bg: "rgba(153,170,204,0.10)",              color: T3,       border: "rgba(153,170,204,0.22)",        dotColor: T4 };
    };

    return (
      <>
        <div className="animate-in fade-in duration-500 -mx-3 -mt-3"
          style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif", background: BG, minHeight: "100vh" }}>

          {/* Page head */}
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <div className="text-[24px] font-normal mb-[4px]" style={{ color: T1, letterSpacing: "-0.6px" }}>Teachers</div>
              <div className="text-[12px] font-normal" style={{ color: T3 }}>Manage teaching staff and monitor performance</div>
            </div>
            <button
              onClick={() => setIsInviteOpen(true)}
              className="h-10 px-[16px] rounded-[14px] flex items-center gap-[8px] text-[12px] font-normal text-white cursor-pointer whitespace-nowrap shrink-0 mt-1 relative overflow-hidden active:scale-[0.95] transition-transform"
              style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
              <Plus className="w-[13px] h-[13px] relative z-10" strokeWidth={2.5} />
              <span className="relative z-10">Add Teacher</span>
            </button>
          </div>

          {/* Stat grid 2x2 */}
          <div className="grid grid-cols-2 gap-[12px] px-5 pt-[16px]">
            {[
              { title: "Avg Class Performance", val: avgClassPerf !== null ? `${avgClassPerf}%` : "0%", valColor: B1,       sub: "Based on recorded results",    subColor: T3,      icon: TrendingUp,   iconBg: "rgba(10,132,255,0.10)",  iconBorder: "rgba(10,132,255,0.18)",  iconColor: B1,     glow: "rgba(10,132,255,0.10)",    onClick: () => navigate("/teacher-performance") },
              { title: "Teacher Attendance",    val: teacherAttPct !== null ? `${teacherAttPct}%` : "100%", valColor: GREEN, sub: teacherAttPct !== null && teacherAttPct >= 95 ? "Excellent" : teacherAttPct !== null && teacherAttPct >= 80 ? "Good" : "Needs attention", subColor: GREEN_D, icon: CalendarCheck, iconBg: "rgba(52,199,89,0.10)",  iconBorder: "rgba(52,199,89,0.20)",  iconColor: GREEN,  glow: "rgba(52,199,89,0.10)",    onClick: () => navigate("/attendance") },
              { title: "Parent Feedback",       val: avgRating !== null ? `${avgRating}/5` : reviewCount > 0 ? "—" : "—",  valColor: GOLD,    sub: `Based on ${reviewCount} review${reviewCount === 1 ? "" : "s"}`, subColor: T3, icon: Star,          iconBg: "rgba(255,204,0,0.12)", iconBorder: "rgba(255,204,0,0.22)", iconColor: GOLD,   glow: "rgba(255,204,0,0.10)",   onClick: () => navigate("/teacher-leaderboard") },
              { title: "Active Teachers",       val: totalCount > 0 ? `${activeCount}/${totalCount}` : "0", valColor: GREEN_D, sub: onLeaveCount > 0 ? `${onLeaveCount} on leave` : activeCount === totalCount && totalCount > 0 ? "All present" : "—", subColor: GREEN_D, icon: Users,         iconBg: "rgba(10,132,255,0.10)",  iconBorder: "rgba(10,132,255,0.18)",  iconColor: B1,     glow: "rgba(52,199,89,0.10)",    onClick: () => navigate("/teacher-performance") },
            ].map(({ title, val, valColor, sub, subColor, icon: Icon, iconBg, iconBorder, iconColor, glow, onClick }) => (
              <button
                key={title}
                onClick={onClick}
                className="bg-white rounded-[20px] p-4 relative overflow-hidden cursor-pointer active:scale-[0.96] transition-transform text-left"
                style={{ boxShadow: SH_LG, border: "0.5px solid rgba(10,132,255,0.10)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                <div className="absolute -top-5 -right-4 w-[70px] h-[70px] rounded-full pointer-events-none" style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`, opacity: 0.5 }} />
                <div className="flex items-start justify-between mb-[12px]">
                  <div className="text-[12px] font-normal uppercase tracking-[0.07em] leading-[1.4]" style={{ color: T4 }}>{title}</div>
                  <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0"
                    style={{ background: iconBg, border: `0.5px solid ${iconBorder}` }}>
                    <Icon className="w-[14px] h-[14px]" style={{ color: iconColor }} strokeWidth={2.4} />
                  </div>
                </div>
                <div className="text-[28px] font-normal leading-none mb-1" style={{ color: valColor, letterSpacing: "-1px" }}>{val}</div>
                <div className="text-[12px] font-normal truncate" style={{ color: subColor }}>{sub}</div>
              </button>
            ))}
          </div>

          {/* Search + Subject filter */}
          <div className="flex gap-2 px-5 pt-3">
            <div className="flex-1 relative">
              <div className="absolute left-[12px] top-1/2 -translate-y-1/2 pointer-events-none">
                <Search className="w-[15px] h-[15px]" style={{ color: "rgba(10,132,255,0.42)" }} strokeWidth={2.2} />
              </div>
              <input
                type="text"
                placeholder="Search teachers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full py-3 pr-[16px] pl-[40px] rounded-[14px] text-[13px] font-normal outline-none bg-white"
                style={{ border: "0.5px solid rgba(10,132,255,0.12)", color: T1, boxShadow: SH, fontFamily: "inherit" }}
              />
            </div>
            <select
              value={subjectFilter}
              onChange={e => setSubjectFilter(e.target.value)}
              className="px-3 rounded-[14px] text-[12px] font-normal bg-white cursor-pointer appearance-none h-11"
              style={{
                border: "0.5px solid rgba(10,132,255,0.12)",
                color: T2,
                boxShadow: SH,
                fontFamily: "inherit",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 10px center",
                paddingRight: "32px",
              }}>
              <option value="">All Subjects</option>
              {allSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>

          {/* Action row — Grid/List toggle + Bulk Import */}
          <div className="flex gap-2 px-5 pt-[12px]">
            <button
              onClick={() => setViewMode("grid")}
              className="h-[38px] px-[16px] rounded-[13px] flex items-center justify-center gap-[8px] text-[12px] font-normal cursor-pointer active:scale-[0.94] transition-transform"
              style={{
                background: viewMode === "grid" ? `linear-gradient(135deg, ${B1}, ${B2})` : "#FFFFFF",
                color: viewMode === "grid" ? "#fff" : T2,
                border: viewMode === "grid" ? "0.5px solid transparent" : "0.5px solid rgba(10,132,255,0.14)",
                boxShadow: viewMode === "grid" ? SH_BTN : SH,
                transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
              }}>
              <LayoutGrid className="w-[13px] h-[13px]" strokeWidth={2.3} />
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="h-[38px] px-[16px] rounded-[13px] flex items-center justify-center gap-[8px] text-[12px] font-normal cursor-pointer active:scale-[0.94] transition-transform"
              style={{
                background: viewMode === "list" ? `linear-gradient(135deg, ${B1}, ${B2})` : "#FFFFFF",
                color: viewMode === "list" ? "#fff" : T2,
                border: viewMode === "list" ? "0.5px solid transparent" : "0.5px solid rgba(10,132,255,0.14)",
                boxShadow: viewMode === "list" ? SH_BTN : SH,
                transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
              }}>
              <List className="w-[13px] h-[13px]" style={{ color: viewMode === "list" ? "#fff" : "rgba(10,132,255,0.6)" }} strokeWidth={2.3} />
              List
            </button>
            <button
              onClick={() => setIsBulkOpen(true)}
              className="h-[38px] px-[16px] rounded-[13px] flex items-center justify-center gap-[8px] text-[12px] font-normal cursor-pointer active:scale-[0.94] transition-transform"
              style={{ background: GREEN_S, border: `0.5px solid ${GREEN_B}`, color: GREEN_D, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
              <Upload className="w-[13px] h-[13px]" strokeWidth={2.3} />
              Bulk Import
            </button>
          </div>

          {/* Section label */}
          <div className="flex items-center gap-2 px-5 pt-4 text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: T4 }}>
            <span>Faculty Directory</span>
            <span className="px-[8px] py-[4px] rounded-full ml-1" style={{ background: "rgba(10,132,255,0.10)", border: "0.5px solid rgba(10,132,255,0.16)", color: B1 }}>
              {filtered.length} teacher{filtered.length === 1 ? "" : "s"}
            </span>
            <span className="flex-1 h-[0.5px]" style={{ background: "rgba(10,132,255,0.12)" }} />
          </div>

          {/* Teacher cards */}
          {filtered.length === 0 ? (
            <div className="mx-5 mt-3 bg-white rounded-[24px] py-10 flex flex-col items-center gap-2"
              style={{ boxShadow: SH_LG, border: "0.5px solid rgba(10,132,255,0.10)" }}>
              <GraduationCap className="w-12 h-12" style={{ color: T4 }} strokeWidth={1.8} />
              <div className="text-[14px] font-normal" style={{ color: T2 }}>No teachers found</div>
              <div className="text-[12px]" style={{ color: T4 }}>Try changing your search or filters</div>
            </div>
          ) : (
            filtered.map(t => {
              const av = avatarGradient(t.color);
              const chip = statusChip(t.status);
              const subjectChipColor = t.subject === "Math" || t.subject?.toLowerCase().includes("math")
                ? { bg: "rgba(255,149,0,0.10)", color: "#86310C", border: "rgba(255,149,0,0.22)" }
                : { bg: "rgba(10,132,255,0.10)", color: B1,          border: "rgba(10,132,255,0.20)" };
              return (
                <div key={t.id} className="mx-5 mt-3 bg-white rounded-[24px] overflow-hidden relative"
                  style={{ boxShadow: SH_LG, border: "0.5px solid rgba(10,132,255,0.10)" }}>
                  {/* Left accent */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[2px]" style={{ background: accentBar(t.color) }} />

                  {/* Card header */}
                  <div className="flex items-start gap-[16px] pl-[24px] pr-[16px] pt-[16px] pb-4 relative" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                    {/* Avatar */}
                    <div className="w-[52px] h-[52px] rounded-[17px] flex items-center justify-center text-[18px] font-normal text-white shrink-0"
                      style={{ background: av.bg, boxShadow: av.shadow }}>
                      {t.initials}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {editingId === t.id ? (
                        <div className="flex items-center gap-[8px] mb-[4px]">
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSaveName(t.id)}
                            className="flex-1 text-[15px] font-normal px-2 py-1 rounded-[8px] outline-none"
                            style={{ border: `1px solid ${B1}66`, color: T1 }}
                          />
                          <button onClick={() => handleSaveName(t.id)} className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white shrink-0"
                            style={{ background: GREEN }}>
                            <Save className="w-[13px] h-[13px]" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-[18px] font-normal mb-[4px] truncate" style={{ color: T1, letterSpacing: "-0.3px" }}>{t.name}</div>
                      )}
                      <div className="text-[12px] font-normal uppercase tracking-[0.06em] mb-2" style={{ color: T3 }}>{t.subject}</div>
                      <div className="inline-flex items-center gap-1 px-[12px] py-[4px] rounded-full text-[12px] font-normal"
                        style={{ background: chip.bg, color: chip.color, border: `0.5px solid ${chip.border}` }}>
                        <span className="w-[5px] h-[5px] rounded-full" style={{ background: chip.dotColor, boxShadow: `0 0 0 1.5px ${chip.dotColor}33` }} />
                        {t.status}
                      </div>
                    </div>
                    {/* Icon tray */}
                    <div className="flex gap-[8px] absolute top-[16px] right-[16px]">
                      <button
                        onClick={() => setSelectedTeacher(t)}
                        className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center active:scale-[0.90] transition-transform"
                        style={{ background: BG, border: "0.5px solid rgba(10,132,255,0.12)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                        aria-label="View">
                        <Eye className="w-[13px] h-[13px]" style={{ color: "rgba(10,132,255,0.55)" }} strokeWidth={2.3} />
                      </button>
                      <button
                        onClick={() => handleTogglePrimary(t)}
                        className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center active:scale-[0.90] transition-transform"
                        style={{
                          background: t.isPrimarySchool ? "rgba(255,204,0,0.10)" : BG,
                          border: `0.5px solid ${t.isPrimarySchool ? "rgba(255,204,0,0.24)" : "rgba(10,132,255,0.12)"}`,
                          transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)",
                        }}
                        aria-label="Primary">
                        <Star className={`w-[13px] h-[13px] ${t.isPrimarySchool ? "fill-current" : ""}`}
                          style={{ color: t.isPrimarySchool ? GOLD : "rgba(10,132,255,0.55)" }} strokeWidth={2.3} />
                      </button>
                      <button
                        onClick={() => handleStartEdit(t)}
                        className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center active:scale-[0.90] transition-transform"
                        style={{ background: BG, border: "0.5px solid rgba(10,132,255,0.12)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                        aria-label="Edit">
                        <Edit3 className="w-[13px] h-[13px]" style={{ color: "rgba(10,132,255,0.55)" }} strokeWidth={2.3} />
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(t.id, t.name)}
                        className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center active:scale-[0.90] transition-transform"
                        style={{ background: RED_S, border: `0.5px solid ${RED_B}`, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                        aria-label="Archive">
                        <Trash2 className="w-[13px] h-[13px]" style={{ color: RED }} strokeWidth={2.3} />
                      </button>
                    </div>
                  </div>

                  {/* Metrics strip */}
                  <div className="flex" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                    <div className="flex-1 px-3 py-[16px] flex flex-col items-center gap-[4px] relative">
                      <div className="text-[20px] font-normal leading-none" style={{ color: B1, letterSpacing: "-0.5px" }}>
                        {t.classCount === null ? <Loader2 className="w-4 h-4 animate-spin inline" /> : t.classCount}
                      </div>
                      <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: T4 }}>Classes</div>
                      <span className="absolute right-0 top-3 bottom-3 w-[0.5px]" style={{ background: "rgba(10,132,255,0.10)" }} />
                    </div>
                    <div className="flex-1 px-3 py-[16px] flex flex-col items-center gap-[4px] relative">
                      <div className="text-[20px] font-normal leading-none" style={{ color: teacherAttPct !== null ? GREEN_D : T4, letterSpacing: "-0.5px" }}>
                        {teacherAttPct !== null ? `${teacherAttPct}%` : "N/A"}
                      </div>
                      <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: T4 }}>Attendance</div>
                      <span className="absolute right-0 top-3 bottom-3 w-[0.5px]" style={{ background: "rgba(10,132,255,0.10)" }} />
                    </div>
                    <div className="flex-1 px-3 py-[16px] flex flex-col items-center gap-[4px]">
                      <div className="flex items-center gap-[4px]">
                        <Star className="w-[14px] h-[14px]" fill={GOLD} stroke={GOLD} />
                        <span className="text-[20px] font-normal" style={{ color: GOLD, letterSpacing: "-0.5px" }}>{t.rating}</span>
                      </div>
                      <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: T4 }}>Rating</div>
                    </div>
                  </div>

                  {/* Detail rows */}
                  <div className="py-1">
                    <div className="flex items-center justify-between px-[16px] py-3" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <div className="flex items-center gap-2 text-[12px] font-normal" style={{ color: T3 }}>
                        <CalendarCheck className="w-[13px] h-[13px]" style={{ color: "rgba(10,132,255,0.5)" }} strokeWidth={2.2} />
                        Experience
                      </div>
                      <div className="text-[13px] font-normal" style={{ color: t.experience === "N/A" ? T4 : T1, letterSpacing: "-0.1px" }}>{t.experience}</div>
                    </div>
                    <div className="flex items-center justify-between px-[16px] py-3" style={{ borderBottom: `0.5px solid ${SEP}` }}>
                      <div className="flex items-center gap-2 text-[12px] font-normal" style={{ color: T3 }}>
                        <BookOpen className="w-[13px] h-[13px]" style={{ color: "rgba(10,132,255,0.5)" }} strokeWidth={2.2} />
                        Subject
                      </div>
                      <span className="px-[8px] py-[4px] rounded-full text-[12px] font-normal"
                        style={{ background: subjectChipColor.bg, color: subjectChipColor.color, border: `0.5px solid ${subjectChipColor.border}` }}>
                        {t.subject}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-[16px] py-3">
                      <div className="flex items-center gap-2 text-[12px] font-normal" style={{ color: T3 }}>
                        <MapPin className="w-[13px] h-[13px]" style={{ color: "rgba(10,132,255,0.5)" }} strokeWidth={2.2} />
                        Campus
                      </div>
                      <div className="text-[13px] font-normal truncate max-w-[140px]" style={{ color: T1, letterSpacing: "-0.1px" }}>
                        {userData?.schoolName || "—"}
                      </div>
                    </div>
                  </div>

                  {/* Action bar */}
                  <div className="flex gap-2 px-4 py-[12px]" style={{ background: "rgba(238,244,255,0.50)" }}>
                    <button
                      onClick={() => setSelectedTeacher(t)}
                      className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[8px] text-[12px] font-normal text-white active:scale-[0.95] transition-transform relative overflow-hidden"
                      style={{ background: `linear-gradient(135deg, ${B1}, ${B2})`, boxShadow: SH_BTN, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                      <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
                      <Eye className="w-[13px] h-[13px] relative z-10" strokeWidth={2.2} />
                      <span className="relative z-10">View Profile</span>
                    </button>
                    <button
                      onClick={() => navigate("/teacher-notes")}
                      className="flex-1 h-[42px] rounded-[13px] flex items-center justify-center gap-[8px] text-[12px] font-normal text-white active:scale-[0.95] transition-transform"
                      style={{ background: "linear-gradient(135deg, #1D1D1F, #0A84FF)", boxShadow: "0 4px 14px rgba(0,8,64,0.24)", transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}>
                      <MessageSquare className="w-[13px] h-[13px]" strokeWidth={2.2} />
                      Message
                    </button>
                    <button
                      onClick={() => handleOpenRoster(t)}
                      className="w-[48px] h-[42px] rounded-[13px] flex items-center justify-center active:scale-[0.90] transition-transform"
                      style={{ background: BG, border: "0.5px solid rgba(10,132,255,0.16)", color: T2, boxShadow: SH, transitionTimingFunction: "cubic-bezier(0.34,1.56,0.64,1)" }}
                      aria-label="More">
                      <MoreHorizontal className="w-[13px] h-[13px]" style={{ color: "rgba(10,132,255,0.6)" }} strokeWidth={2.3} />
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* AI Faculty Summary */}
          {totalCount > 0 && (
            <div className="mx-5 mt-3 rounded-[24px] px-[24px] py-5 relative overflow-hidden"
              style={{
                background: "linear-gradient(140deg, #0A84FF 0%, #0A84FF 48%, #0A84FF 100%)",
                boxShadow: "0 8px 28px rgba(0,51,204,0.28), 0 0 0 0.5px rgba(255,255,255,0.14)",
              }}>
              <div className="absolute -top-9 -right-6 w-[155px] h-[155px] rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 65%)" }} />
              <div className="absolute inset-0 pointer-events-none" style={{
                backgroundImage: "linear-gradient(rgba(255,255,255,0.014) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.014) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }} />
              <div className="flex items-center gap-[8px] mb-3 relative z-10">
                <div className="w-7 h-7 rounded-[9px] flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.18)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                  <TrendingUp className="w-[14px] h-[14px]" style={{ color: "rgba(255,255,255,0.90)" }} strokeWidth={2.3} />
                </div>
                <span className="text-[12px] font-normal uppercase tracking-[0.12em]" style={{ color: "rgba(255,255,255,0.55)" }}>AI Faculty Intelligence</span>
              </div>
              <p className="text-[13px] leading-[1.72] font-normal relative z-10" style={{ color: "rgba(255,255,255,0.85)" }}>
                <strong style={{ color: "#fff", fontWeight: 400 }}>{totalCount} teacher{totalCount === 1 ? "" : "s"}</strong> on faculty · {activeCount === totalCount ? "All active" : `${activeCount} active`}{onLeaveCount > 0 && `, ${onLeaveCount} on leave`}.
                {teacherAttPct !== null && <> Teacher attendance is <strong style={{ color: "#fff", fontWeight: 400 }}>{teacherAttPct}%</strong>.</>}
                {avgRating !== null && <> Average rating from parent feedback: <strong style={{ color: "#fff", fontWeight: 400 }}>{avgRating}/5 stars</strong>.</>}
                {avgClassPerf !== null && <> Avg class performance across results: <strong style={{ color: "#fff", fontWeight: 400 }}>{avgClassPerf}%</strong>.</>}
              </p>
              <div className="grid grid-cols-3 rounded-[16px] overflow-hidden mt-[16px] relative z-10" style={{ gap: "1px", background: "rgba(255,255,255,0.12)" }}>
                <div className="py-[12px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[22px] font-normal text-white leading-none mb-1" style={{ letterSpacing: "-0.6px" }}>{totalCount}</div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>Teachers</div>
                </div>
                <div className="py-[12px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[22px] font-normal text-white leading-none mb-1" style={{ letterSpacing: "-0.6px" }}>{avgRating !== null ? `${avgRating} ★` : "—"}</div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>Avg Rating</div>
                </div>
                <div className="py-[12px] px-3 text-center" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="text-[22px] font-normal text-white leading-none mb-1" style={{ letterSpacing: "-0.6px" }}>{teacherAttPct !== null ? `${teacherAttPct}%` : "100%"}</div>
                  <div className="text-[12px] font-normal uppercase tracking-[0.09em]" style={{ color: "rgba(255,255,255,0.40)" }}>Attendance</div>
                </div>
              </div>
            </div>
          )}

          <div className="h-6" />
        </div>

        {/* ── INVITE DIALOG (shared with desktop state) ──────────────────── */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[440px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-normal text-[#1D1D1F]">Invite Teacher</DialogTitle>
              <DialogDescription className="text-slate-500">Send an email invitation to a new faculty member.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Full Name</Label>
                <Input placeholder="Mrs. Kavita Sharma" className="h-11 rounded-xl"
                  value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Email Address</Label>
                <Input type="email" placeholder="teacher@school.edu" className="h-11 rounded-xl"
                  value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Subject</Label>
                <Input placeholder="e.g. Mathematics" className="h-11 rounded-xl"
                  value={inviteForm.subject} onChange={e => setInviteForm({ ...inviteForm, subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Assign Class (Optional)</Label>
                <select
                  value={inviteForm.assignClassId}
                  onChange={e => setInviteForm({ ...inviteForm, assignClassId: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#1D1D1F]/20"
                >
                  <option value="">— Not assigned —</option>
                  {availableClasses.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={isSending}
                className="w-full h-11 rounded-xl bg-[#1D1D1F] text-white font-normal hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><CheckCircle className="w-4 h-4" /> Send Invitation</>}
              </button>
            </form>
          </DialogContent>
        </Dialog>

        {/* ── BULK IMPORT DIALOG (shared) ──────────────────────────────── */}
        <Dialog open={isBulkOpen} onOpenChange={(v) => { setIsBulkOpen(v); if (!v) { setBulkData([]); setBulkDone(false); } }}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[85vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-normal text-[#1D1D1F] flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Bulk Import Teachers
              </DialogTitle>
              <DialogDescription className="text-slate-500">Upload an Excel/CSV file to import multiple teachers at once.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              {bulkData.length === 0 ? (
                <div className="space-y-3">
                  <button onClick={downloadTemplate}
                    className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-normal text-sm flex items-center justify-center gap-2 hover:bg-slate-100">
                    <Download className="w-4 h-4" /> Download Template
                  </button>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full h-12 rounded-xl bg-[#1D1D1F] text-white font-normal text-sm flex items-center justify-center gap-2 hover:opacity-90">
                    <Upload className="w-4 h-4" /> Choose Excel / CSV File
                  </button>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-slate-100 overflow-hidden max-h-[60vh] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-[12px] font-normal uppercase text-slate-500">Name</th>
                          <th className="px-3 py-2 text-left text-[12px] font-normal uppercase text-slate-500">Email</th>
                          <th className="px-3 py-2 text-right text-[12px] font-normal uppercase text-slate-500">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {bulkData.map((t, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-normal text-slate-800 text-xs">{t.name}</td>
                            <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-[140px]">{t.email}</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`inline-block text-[12px] font-normal px-2 py-0.5 rounded-full ${
                                t._status === "success" ? "bg-green-100 text-green-700" :
                                t._status === "duplicate" ? "bg-amber-100 text-amber-700" :
                                t._status === "error" ? "bg-rose-100 text-rose-700" :
                                "bg-slate-100 text-slate-500"
                              }`}>
                                {t._status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!bulkDone && (
                      <button onClick={handleBulkImport} disabled={isBulkProcessing}
                        className="flex-1 h-11 rounded-xl bg-[#1D1D1F] text-white font-normal text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        {isBulkProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Import {bulkData.length} Teachers</>}
                      </button>
                    )}
                    <button onClick={() => { setBulkData([]); setBulkDone(false); }}
                      className="px-4 h-11 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm font-normal">
                      Clear
                    </button>
                  </div>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── ROSTER DIALOG (shared) ────────────────────────────────────── */}
        <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[80vh] overflow-y-auto rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-normal text-[#1D1D1F]">Class Roster — {teacherToAssign?.name}</DialogTitle>
              <DialogDescription className="text-slate-500">Students currently enrolled under this teacher.</DialogDescription>
            </DialogHeader>
            <div className="py-2">
              {loadingRoster ? (
                <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-[#1D1D1F]" /></div>
              ) : teacherRoster.length > 0 ? (
                <div className="rounded-xl overflow-hidden border border-slate-100">
                  <div className="divide-y divide-slate-50">
                    {teacherRoster.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0">
                          <p className="font-normal text-slate-800 text-sm truncate">{s.studentName}</p>
                          <p className="text-[12px] text-slate-400 truncate">{s.studentEmail}</p>
                        </div>
                        <span className="font-normal text-[#1D1D1F] text-xs shrink-0">{s.className || "General"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-normal text-slate-400">No enrollment records found</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  DESKTOP — Blue Apple Design
  // ═══════════════════════════════════════════════════════════════
  const dB1 = "#0A84FF", dB2 = "#3395FF", dB4 = "#7CBBFF";
  const dBG = "#F5F5F7", dBG2 = "#EBEBF0";
  const dT1 = "#1D1D1F", dT2 = "#3A3A3C", dT3 = "#6E6E73", dT4 = "#A1A1A6";
  const dSEP = "rgba(10,132,255,0.08)";
  const dGREEN = "#34C759", dGREEN_D = "#248A3D", dGREEN_S = "rgba(52,199,89,0.10)", dGREEN_B = "rgba(52,199,89,0.22)";
  const dRED = "#FF3B30";
  const dORANGE = "#FF9500";
  const dGOLD = "#FFCC00";
  const dVIOLET = "#AF52DE";
  const dSH = "0 0 0 0.5px rgba(10,132,255,0.08), 0 2px 10px rgba(10,132,255,0.07), 0 10px 28px rgba(10,132,255,0.09)";
  const dSH_LG = "0 0 0 0.5px rgba(10,132,255,0.10), 0 4px 16px rgba(10,132,255,0.10), 0 18px 44px rgba(10,132,255,0.12)";
  const dSH_BTN = "0 6px 22px rgba(10,132,255,0.38), 0 2px 5px rgba(10,132,255,0.18)";

  // Avatar gradient
  const avatarGradD = (color: string) => {
    if (color?.includes("emerald"))  return { bg: `linear-gradient(135deg, ${dGREEN}, #34C759)`, shadow: "0 4px 14px rgba(52,199,89,0.26)" };
    if (color?.includes("amber"))    return { bg: `linear-gradient(135deg, ${dORANGE}, #FFCC00)`, shadow: "0 4px 14px rgba(255,149,0,0.26)" };
    if (color?.includes("rose"))     return { bg: `linear-gradient(135deg, ${dRED}, #FF6961)`, shadow: "0 4px 14px rgba(255,59,48,0.26)" };
    if (color?.includes("indigo"))   return { bg: `linear-gradient(135deg, ${dVIOLET}, #AF52DE)`, shadow: "0 4px 14px rgba(175,82,222,0.26)" };
    if (color?.includes("teal"))     return { bg: "linear-gradient(135deg, #5AC8FA, #5AC8FA)", shadow: "0 4px 14px rgba(90,200,250,0.22)" };
    return                            { bg: `linear-gradient(135deg, ${dB1}, ${dB2})`, shadow: "0 4px 14px rgba(10,132,255,0.26)" };
  };

  const statusChipD = (status: string) => {
    if (status === "Active")   return { bg: dGREEN_S, color: dGREEN_D, border: dGREEN_B };
    if (status === "On Leave") return { bg: "rgba(255,149,0,0.10)", color: "#86310C", border: "rgba(255,149,0,0.22)" };
    if (status === "Invited")  return { bg: "rgba(10,132,255,0.10)", color: dB1, border: "rgba(10,132,255,0.20)" };
    return                     { bg: "rgba(153,170,204,0.10)", color: dT3, border: "rgba(153,170,204,0.22)" };
  };

  return (
    <div className="pb-10 w-full px-2 animate-in fade-in duration-500"
      style={{ fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', sans-serif" }}>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 pt-2 pb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: "0 6px 18px rgba(10,132,255,0.28)" }}>
            <GraduationCap className="w-[22px] h-[22px] text-white" strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-[24px] font-normal leading-none" style={{ color: dT1, letterSpacing: "-0.6px" }}>Teachers</div>
            <div className="text-[12px] mt-1" style={{ color: dT3 }}>Manage teaching staff and monitor performance</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsBulkOpen(true)}
            className="h-11 px-4 rounded-[13px] flex items-center gap-2 text-[12px] font-normal transition-transform hover:scale-[1.02]"
            style={{ background: dGREEN_S, border: `0.5px solid ${dGREEN_B}`, color: dGREEN_D }}>
            <Upload className="w-[14px] h-[14px]" strokeWidth={2.3} />
            Bulk Import
          </button>
          <button
            onClick={() => setIsInviteOpen(true)}
            className="h-11 px-5 rounded-[13px] flex items-center gap-2 text-[13px] font-normal text-white relative overflow-hidden transition-transform hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg, ${dB1}, ${dB2})`, boxShadow: dSH_BTN }}>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 52%)" }} />
            <Plus className="w-[14px] h-[14px] relative z-10" strokeWidth={2.5} />
            <span className="relative z-10">Add Teacher</span>
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
              <Users className="w-7 h-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-[12px] font-normal uppercase tracking-[0.16em] mb-[8px]" style={{ color: "rgba(255,255,255,0.55)" }}>Faculty Directory</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[28px] font-normal leading-none tracking-tight">{totalCount}</span>
                <span className="text-[14px] font-normal" style={{ color: "rgba(255,255,255,0.50)" }}>active teachers</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <CheckCircle className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>Active</div>
                <div className="text-[22px] font-normal leading-none" style={{ letterSpacing: "-0.5px" }}>{activeCount}</div>
              </div>
            </div>
            <div className="w-px h-10" style={{ background: "rgba(255,255,255,0.18)" }} />
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.16)", border: "0.5px solid rgba(255,255,255,0.26)" }}>
                <Star className="w-[18px] h-[18px] text-white" strokeWidth={2.3} fill="white" />
              </div>
              <div>
                <div className="text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: "rgba(255,255,255,0.50)" }}>Avg Rating</div>
                <div className="text-[22px] font-normal leading-none" style={{ letterSpacing: "-0.5px" }}>{avgRating !== null ? `${avgRating}/5` : "—"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
        {[
          { title: "Avg Class Performance", val: avgClassPerf !== null ? `${avgClassPerf}%` : "—", valColor: dB1, sub: avgClassPerf !== null ? "Based on recorded results" : "No results yet", subColor: dT3, Icon: TrendingUp, grad: `linear-gradient(135deg, ${dB1}, ${dB2})`, glow: "rgba(10,132,255,0.10)", shadow: "0 4px 14px rgba(10,132,255,0.26)", onClick: () => navigate("/teacher-performance") },
          { title: "Teacher Attendance", val: teacherAttPct !== null ? `${teacherAttPct}%` : "—", valColor: dGREEN_D, sub: teacherAttPct !== null ? (teacherAttPct >= 90 ? "Excellent" : teacherAttPct >= 75 ? "Good" : "Needs attention") : "No records yet", subColor: dGREEN_D, Icon: CalendarCheck, grad: `linear-gradient(135deg, ${dGREEN}, #34C759)`, glow: "rgba(52,199,89,0.10)", shadow: "0 4px 14px rgba(52,199,89,0.22)", onClick: () => navigate("/attendance") },
          { title: "Parent Feedback", val: avgRating !== null ? `${avgRating}/5` : "—", valColor: dGOLD, sub: reviewCount > 0 ? `Based on ${reviewCount} reviews` : "No reviews yet", subColor: dT3, Icon: Star, grad: `linear-gradient(135deg, ${dGOLD}, #FFCC00)`, glow: "rgba(255,204,0,0.12)", shadow: "0 4px 14px rgba(255,204,0,0.26)", onClick: () => navigate("/teacher-leaderboard") },
          { title: "Active Teachers", val: totalCount > 0 ? `${activeCount}/${totalCount}` : "0", valColor: dVIOLET, sub: onLeaveCount > 0 ? `${onLeaveCount} on leave` : activeCount === totalCount && totalCount > 0 ? "All present" : "—", subColor: onLeaveCount > 0 ? dORANGE : dGREEN_D, Icon: Users, grad: `linear-gradient(135deg, ${dVIOLET}, #AF52DE)`, glow: "rgba(175,82,222,0.10)", shadow: "0 4px 14px rgba(175,82,222,0.24)", onClick: () => navigate("/teacher-performance") },
        ].map(({ title, val, valColor, sub, subColor, Icon, grad, glow, shadow, onClick }) => (
          <button key={title} onClick={onClick}
            className="bg-white rounded-[20px] p-5 relative overflow-hidden text-left transition-transform hover:scale-[1.02]"
            style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
            <div className="absolute -top-6 -right-6 w-[100px] h-[100px] rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${glow} 0%, transparent 70%)` }} />
            <div className="flex items-center justify-between mb-4 relative">
              <span className="text-[12px] font-normal uppercase tracking-[0.10em]" style={{ color: dT4 }}>{title}</span>
              <div className="w-10 h-10 rounded-[12px] flex items-center justify-center"
                style={{ background: grad, boxShadow: shadow }}>
                <Icon className="w-[18px] h-[18px] text-white" strokeWidth={2.3} />
              </div>
            </div>
            <p className="text-[28px] font-normal tracking-tight leading-none mb-1.5" style={{ color: valColor, letterSpacing: "-1px" }}>{val}</p>
            <p className="text-[12px] font-normal truncate" style={{ color: subColor }}>{sub}</p>
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 mt-5 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(10,132,255,0.42)" }} strokeWidth={2.2} />
          <input
            type="text"
            placeholder="Search teachers…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 bg-white rounded-[14px] text-[13px] font-normal outline-none"
            style={{ border: `0.5px solid ${dSEP}`, color: dT1, boxShadow: dSH, fontFamily: "inherit" }}
          />
        </div>
        {[
          { value: subjectFilter, set: setSubjectFilter, all: "All Subjects", opts: allSubjects.map(s => ({ value: s, label: s })) },
          { value: statusFilter, set: setStatusFilter, all: "All Status", opts: [{ value: "Active", label: "Active" }, { value: "On Leave", label: "On Leave" }, { value: "Invited", label: "Invited" }] },
        ].map((f, i) => (
          <select key={i}
            value={f.value}
            onChange={e => f.set(e.target.value)}
            className="h-11 px-4 pr-10 bg-white rounded-[14px] text-[13px] font-normal outline-none cursor-pointer appearance-none"
            style={{
              border: `0.5px solid ${dSEP}`,
              color: dT2,
              boxShadow: dSH,
              fontFamily: "inherit",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%230055FF' stroke-width='2.5' stroke-linecap='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 14px center",
            }}>
            <option value="">{f.all}</option>
            {f.opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        <div className="flex items-center gap-1 bg-white rounded-[13px] p-1" style={{ border: `0.5px solid ${dSEP}`, boxShadow: dSH }}>
          <button
            onClick={() => setViewMode("grid")}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-transform hover:scale-[1.06]"
            style={{
              background: viewMode === "grid" ? `linear-gradient(135deg, ${dB1}, ${dB2})` : "transparent",
              color: viewMode === "grid" ? "#fff" : dT4,
            }}>
            <LayoutGrid className="w-4 h-4" strokeWidth={2.3} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center transition-transform hover:scale-[1.06]"
            style={{
              background: viewMode === "list" ? `linear-gradient(135deg, ${dB1}, ${dB2})` : "transparent",
              color: viewMode === "list" ? "#fff" : dT4,
            }}>
            <List className="w-4 h-4" strokeWidth={2.3} />
          </button>
        </div>
      </div>

      {/* ── BULK IMPORT DIALOG ────────────────────────────────────────────── */}
      <Dialog open={isBulkOpen} onOpenChange={(o) => { if (!o) { setIsBulkOpen(false); setBulkDone(false); setBulkData([]); } else setIsBulkOpen(true); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[560px] max-h-[90vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-normal text-[#1D1D1F]">Bulk Import Teachers</DialogTitle>
            <DialogDescription className="text-slate-500">Upload an Excel (.xlsx) file to invite multiple teachers at once.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!bulkDone && (
              <div>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#1D1D1F]/40 hover:bg-slate-50 transition-all"
                >
                  <Upload className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-normal text-slate-500">Click to upload Excel file</p>
                  <p className="text-xs text-slate-400 mt-1">.xlsx or .xls format</p>
                  <input type="file" hidden ref={fileInputRef} accept=".xlsx,.xls" onChange={handleFileUpload} />
                </div>
                <button onClick={downloadTemplate} className="mt-2 text-xs font-normal text-[#1D1D1F] flex items-center gap-1.5 mx-auto hover:underline">
                  <Download className="w-3 h-3" /> Download template
                </button>
              </div>
            )}
            {bulkData.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[240px] overflow-y-auto">
                {bulkData.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-3 border-b border-slate-50 last:border-0 bg-white">
                    <div>
                      <p className="text-sm font-normal text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-400">{t.email}</p>
                    </div>
                    <span className={`text-[12px] font-normal px-2 py-1 rounded-full uppercase ${
                      t._status === "success"   ? "bg-green-50 text-green-600"  :
                      t._status === "duplicate" ? "bg-amber-50 text-amber-600"  :
                      t._status === "error"     ? "bg-red-50 text-red-600"      :
                      "bg-blue-50 text-blue-600"
                    }`}>{t._status}</span>
                  </div>
                ))}
              </div>
            )}
            {bulkDone && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Invited",    color: "bg-green-50 text-green-600",  count: bulkData.filter(t => t._status === "success").length   },
                  { label: "Duplicates", color: "bg-amber-50 text-amber-600",  count: bulkData.filter(t => t._status === "duplicate").length  },
                  { label: "Failed",     color: "bg-red-50 text-red-600",      count: bulkData.filter(t => t._status === "error").length      },
                ].map(({ label, color, count }) => (
                  <div key={label} className={`p-4 rounded-xl border text-center ${color.replace("text-", "border-").replace("600", "100")}`}>
                    <p className={`text-2xl font-normal ${color.split(" ")[1]}`}>{count}</p>
                    <p className={`text-[12px] font-normal uppercase ${color.split(" ")[1]}`}>{label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            {!bulkDone ? (
              <button
                onClick={handleBulkImport}
                disabled={bulkData.length === 0 || isBulkProcessing}
                className="w-full h-11 rounded-xl bg-[#1D1D1F] text-white font-normal hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isBulkProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <><Upload className="w-4 h-4" /> Import & Invite All</>}
              </button>
            ) : (
              <button
                onClick={() => { setIsBulkOpen(false); setBulkDone(false); setBulkData([]); }}
                className="w-full h-11 rounded-xl bg-green-600 text-white font-normal hover:opacity-90 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Done
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── INVITE DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-normal text-[#1D1D1F]">Add Teacher</DialogTitle>
            <DialogDescription className="text-slate-500">
              They'll receive an email invitation to join {userData?.schoolName || "the school"}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInvite} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Full Name</Label>
              <Input placeholder="Mrs. Kavita Sharma" className="h-11 rounded-xl"
                value={inviteForm.name} onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Email Address</Label>
              <Input type="email" placeholder="teacher@school.edu" className="h-11 rounded-xl"
                value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Subject</Label>
              <Input placeholder="e.g. Mathematics" className="h-11 rounded-xl"
                value={inviteForm.subject} onChange={e => setInviteForm({ ...inviteForm, subject: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-normal text-slate-500 uppercase tracking-wide">Assign Class (Optional)</Label>
              <select
                value={inviteForm.assignClassId}
                onChange={e => setInviteForm({ ...inviteForm, assignClassId: e.target.value })}
                className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#1D1D1F]/20"
              >
                <option value="">— Not assigned —</option>
                {availableClasses.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={isSending}
              className="w-full h-11 rounded-xl bg-[#1D1D1F] text-white font-normal hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><CheckCircle className="w-4 h-4" /> Send Invitation</>}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── ROSTER DIALOG ─────────────────────────────────────────────────── */}
      <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[640px] max-h-[80vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-normal text-[#1D1D1F]">Class Roster — {teacherToAssign?.name}</DialogTitle>
            <DialogDescription className="text-slate-500">Students currently enrolled under this teacher.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {loadingRoster ? (
              <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-[#1D1D1F]" /></div>
            ) : teacherRoster.length > 0 ? (
              <div className="rounded-xl overflow-hidden border border-slate-100 overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-[#1D1D1F] text-white">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-normal uppercase tracking-wide">Student</th>
                      <th className="px-5 py-3 text-left text-xs font-normal uppercase tracking-wide">Class</th>
                      <th className="px-5 py-3 text-right text-xs font-normal uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {teacherRoster.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-normal text-slate-800">{s.studentName}</p>
                          <p className="text-xs text-slate-400 mt-1">{s.studentEmail}</p>
                        </td>
                        <td className="px-5 py-3 font-normal text-[#1D1D1F]">{s.className || "General"}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`text-[12px] font-normal px-2.5 py-1 rounded-full uppercase ${
                            s.status === "Active" ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                          }`}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-normal text-slate-400">No enrollment records found</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Section Label */}
      <div className="flex items-center gap-3 mt-6 mb-3">
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center"
          style={{ background: "rgba(10,132,255,0.10)", border: "0.5px solid rgba(10,132,255,0.22)" }}>
          <GraduationCap className="w-4 h-4" style={{ color: dB1 }} strokeWidth={2.4} />
        </div>
        <div className="text-[15px] font-normal" style={{ color: dT1, letterSpacing: "-0.2px" }}>Faculty Directory</div>
        <span className="text-[12px] font-normal px-3 py-1 rounded-full"
          style={{ background: "rgba(10,132,255,0.10)", color: dB1, border: "0.5px solid rgba(10,132,255,0.18)" }}>
          {filtered.length} teacher{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Teacher Grid / List / Empty */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-[20px] py-10 flex flex-col items-center gap-3 text-center" style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="w-16 h-16 rounded-[18px] flex items-center justify-center"
            style={{ background: "rgba(10,132,255,0.10)", border: "0.5px solid rgba(10,132,255,0.22)" }}>
            <GraduationCap className="w-8 h-8" style={{ color: dB1 }} strokeWidth={2} />
          </div>
          <p className="text-[14px] font-normal" style={{ color: dT1 }}>No teachers found</p>
          <p className="text-[12px]" style={{ color: dT4 }}>Try changing your search or filters</p>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(t => {
            const av = avatarGradD(t.color);
            const chip = statusChipD(t.status);
            return (
              <div key={t.id}
                onClick={() => setSelectedTeacher(t)}
                className="bg-white rounded-[20px] p-5 cursor-pointer group relative overflow-hidden transition-transform hover:scale-[1.02]"
                style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>

                {/* Hover actions */}
                <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button onClick={e => { e.stopPropagation(); handleOpenRoster(t); }}
                    className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center"
                    style={{ border: `0.5px solid ${dSEP}`, color: dT4, boxShadow: dSH }}
                    title="View Roster">
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleTogglePrimary(t); }}
                    className="w-8 h-8 rounded-[10px] flex items-center justify-center"
                    style={{
                      background: t.isPrimarySchool ? "rgba(255,204,0,0.12)" : "#fff",
                      border: `0.5px solid ${t.isPrimarySchool ? "rgba(255,204,0,0.30)" : dSEP}`,
                      color: t.isPrimarySchool ? dGOLD : dT4,
                      boxShadow: dSH,
                    }}
                    title={t.isPrimarySchool ? "Primary school" : "Mark as primary"}>
                    <Star className={`w-3.5 h-3.5 ${t.isPrimarySchool ? "fill-current" : ""}`} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleStartEdit(t); }}
                    className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center"
                    style={{ border: `0.5px solid ${dSEP}`, color: dT4, boxShadow: dSH }}
                    title="Edit Name">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDeleteTeacher(t.id, t.name); }}
                    className="w-8 h-8 bg-white rounded-[10px] flex items-center justify-center"
                    style={{ border: `0.5px solid ${dSEP}`, color: dT4, boxShadow: dSH }}
                    title="Archive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Avatar row */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-[14px] flex items-center justify-center text-white text-[15px] font-normal shrink-0"
                    style={{ background: av.bg, boxShadow: av.shadow }}>
                    {t.initials}
                  </div>
                  <div className="min-w-0">
                    {editingId === t.id ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <input autoFocus value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleSaveName(t.id)}
                          className="w-full text-[14px] font-normal rounded-[8px] px-2 py-1 outline-none"
                          style={{ border: `1px solid ${dB1}66`, color: dT1 }} />
                        <button onClick={() => handleSaveName(t.id)}
                          className="w-7 h-7 rounded-[8px] flex items-center justify-center text-white shrink-0"
                          style={{ background: dGREEN }}>
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="text-[14px] font-normal truncate leading-tight" style={{ color: dT1, letterSpacing: "-0.1px" }}>{t.name}</h3>
                    )}
                    <p className="text-[12px] mt-1 truncate" style={{ color: dT3 }}>{t.subject}</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-[12px] pt-3" style={{ borderTop: `0.5px solid ${dSEP}` }}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-normal" style={{ color: dT3 }}>
                      <BookOpen className="w-[12px] h-[12px]" strokeWidth={2.2} />
                      Classes
                    </span>
                    <span className="text-[13px] font-normal" style={{ color: dT1 }}>
                      {t.classCount === null ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" style={{ color: dT4 }} /> : t.classCount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-normal" style={{ color: dT3 }}>
                      <MapPin className="w-[12px] h-[12px]" strokeWidth={2.2} />
                      Experience
                    </span>
                    <span className="text-[13px] font-normal" style={{ color: dT1 }}>{t.experience}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[12px] font-normal" style={{ color: dT3 }}>
                      <Star className="w-[12px] h-[12px]" strokeWidth={2.2} />
                      Rating
                    </span>
                    <span className="flex items-center gap-1 px-2 py-[2px] rounded-full"
                      style={{ background: "rgba(255,204,0,0.10)", border: "0.5px solid rgba(255,204,0,0.22)" }}>
                      <Star className="w-[11px] h-[11px]" style={{ color: dGOLD, fill: dGOLD }} />
                      <span className="text-[12px] font-normal" style={{ color: "#86310C" }}>{t.rating}</span>
                    </span>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="mt-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-[4px] rounded-full text-[12px] font-normal uppercase tracking-[0.08em]"
                    style={{ background: chip.bg, color: chip.color, border: `0.5px solid ${chip.border}` }}>
                    <span className="w-[6px] h-[6px] rounded-full" style={{ background: chip.color }} />
                    {t.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST */
        <div className="bg-white rounded-[20px] overflow-hidden"
          style={{ boxShadow: dSH_LG, border: `0.5px solid ${dSEP}` }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr style={{ background: dBG, borderBottom: `0.5px solid ${dSEP}` }}>
                  {["Teacher", "Subject", "Classes", "Experience", "Rating", "Status", "Actions"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-[12px] font-normal uppercase tracking-[0.10em] ${i >= 2 && i <= 5 ? "text-center" : i === 6 ? "text-right" : "text-left"}`}
                      style={{ color: dT4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const av = avatarGradD(t.color);
                  const chip = statusChipD(t.status);
                  return (
                    <tr key={t.id}
                      onClick={() => setSelectedTeacher(t)}
                      className="cursor-pointer transition-colors hover:bg-[#F8FAFF]"
                      style={{ borderBottom: `0.5px solid ${dSEP}` }}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-white text-[12px] font-normal shrink-0"
                            style={{ background: av.bg, boxShadow: av.shadow }}>
                            {t.initials}
                          </div>
                          <div>
                            <p className="text-[13px] font-normal" style={{ color: dT1 }}>{t.name}</p>
                            <p className="text-[12px] font-normal" style={{ color: dT3 }}>{t.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center px-3 py-[4px] rounded-full text-[12px] font-normal"
                          style={{ background: "rgba(10,132,255,0.10)", color: dB1, border: "0.5px solid rgba(10,132,255,0.20)" }}>
                          {t.subject}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center text-[13px] font-normal" style={{ color: dT1 }}>
                        {t.classCount === null ? "…" : t.classCount}
                      </td>
                      <td className="px-5 py-4 text-center text-[12px] font-normal" style={{ color: dT3 }}>{t.experience}</td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center justify-center gap-1 px-3 py-[4px] rounded-full"
                          style={{ background: "rgba(255,204,0,0.10)", border: "0.5px solid rgba(255,204,0,0.22)" }}>
                          <Star className="w-[11px] h-[11px]" style={{ color: dGOLD, fill: dGOLD }} />
                          <span className="text-[12px] font-normal" style={{ color: "#86310C" }}>{t.rating}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-[4px] rounded-full text-[12px] font-normal uppercase tracking-[0.08em]"
                          style={{ background: chip.bg, color: chip.color, border: `0.5px solid ${chip.border}` }}>
                          <span className="w-[6px] h-[6px] rounded-full" style={{ background: chip.color }} />
                          {t.status}
                        </span>
                      </td>
                      <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {[
                            { onClick: () => handleOpenRoster(t), Icon: Eye, title: "View Roster", color: dB1 },
                            { onClick: () => handleTogglePrimary(t), Icon: Star, title: t.isPrimarySchool ? "Primary school" : "Mark as primary", color: dGOLD, active: t.isPrimarySchool },
                            { onClick: () => handleStartEdit(t), Icon: Edit3, title: "Edit Name", color: dORANGE },
                            { onClick: () => handleDeleteTeacher(t.id, t.name), Icon: Trash2, title: "Archive", color: dRED },
                          ].map(({ onClick, Icon, title, color, active }, i) => (
                            <button key={i} onClick={onClick}
                              className="w-8 h-8 rounded-[10px] flex items-center justify-center transition-colors hover:bg-[#F0F5FF]"
                              style={{ color: active ? color : dT4 }}
                              title={title}>
                              <Icon className={`w-[14px] h-[14px] ${active ? "fill-current" : ""}`} strokeWidth={2.2} />
                            </button>
                          ))}
                        </div>
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

export default Teachers;
