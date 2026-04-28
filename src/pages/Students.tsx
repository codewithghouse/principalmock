import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Download, GraduationCap,
  Loader2, X,
  Filter, Upload, FileSpreadsheet, Archive, CheckCircle
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import {
  collection, addDoc, serverTimestamp,
  query, where, onSnapshot, writeBatch, doc, getDocs
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { sendEmail } from "@/lib/resend";
import * as XLSX from "xlsx";
import { useIsMobile } from "@/hooks/use-mobile";
import StudentsMobile from "@/components/dashboard/StudentsMobile";
import DesktopStudentsView from "@/components/dashboard/DesktopStudentsView";

// ── Types ────────────────────────────────────────────────────────────────────
interface BulkStudent {
  name: string;
  email: string;
  class?: string;
  rollNo?: string;
  parentPhone?: string;
  admissionDate?: string;
  _status?: "pending" | "success" | "error" | "duplicate";
  _error?: string;
}

const TEMPLATE_DATA = [
  { Name: "Aryan Sharma", Email: "aryan@example.com", Class: "8-A", RollNo: "01", ParentPhone: "9876543210", AdmissionDate: "2024-06-01" },
  { Name: "Priya Verma",  Email: "priya@example.com", Class: "8-B", RollNo: "02", ParentPhone: "9876543211", AdmissionDate: "2024-06-01" },
];

// ── Smart column detection so users can upload ANY template ─────────────────
// Each canonical field has a synonym list. Headers are normalized (lowercased,
// stripped of spaces/underscores/dots) before matching, so "Student Full Name",
// "student_name", "STUDENT.NAME", "स्टूडेंट" → all funnel to the right field.
type FieldKey = "name" | "email" | "class" | "rollNo" | "parentPhone" | "admissionDate";
const FIELD_LABELS: Record<FieldKey, { label: string; required: boolean }> = {
  name:          { label: "Name",           required: true  },
  email:         { label: "Email",          required: true  },
  class:         { label: "Class",          required: false },
  rollNo:        { label: "Roll No",        required: false },
  parentPhone:   { label: "Parent Phone",   required: false },
  admissionDate: { label: "Admission Date", required: false },
};
const SYNONYMS: Record<FieldKey, string[]> = {
  name:          ["name", "fullname", "studentname", "student", "studentfullname", "childname", "pupilname"],
  email:         ["email", "emailaddress", "mail", "studentemail", "emailid", "mailid"],
  class:         ["class", "classname", "section", "grade", "standard", "std", "div", "division", "classsection"],
  rollNo:        ["rollno", "roll", "rollnumber", "regno", "regnumber", "registration", "registrationno", "admissionno", "admno", "studentid", "id", "srno"],
  parentPhone:   ["parentphone", "phone", "mobile", "contact", "parentmobile", "parentnumber", "parentcontact", "phonenumber", "mobilenumber", "guardianphone", "guardianmobile", "fatherphone", "motherphone"],
  admissionDate: ["admissiondate", "admission", "doj", "dateofjoining", "joined", "joiningdate", "enrolldate", "enrollmentdate", "admittedon", "admitdate", "startdate", "dateofadmission"],
};
const normalizeHeader = (s: string) => String(s).toLowerCase().replace(/[\s_\-./()]/g, "");

const detectColumns = (headers: string[]): Record<FieldKey, string> => {
  const mapping: Record<FieldKey, string> = {
    name: "", email: "", class: "", rollNo: "", parentPhone: "", admissionDate: "",
  };
  const used = new Set<string>();
  // Pass 1 — exact normalized match (highest confidence)
  (Object.keys(SYNONYMS) as FieldKey[]).forEach(field => {
    const match = headers.find(h => !used.has(h) && SYNONYMS[field].includes(normalizeHeader(h)));
    if (match) { mapping[field] = match; used.add(match); }
  });
  // Pass 2 — partial substring match for whatever's still unmapped
  (Object.keys(SYNONYMS) as FieldKey[]).forEach(field => {
    if (mapping[field]) return;
    const match = headers.find(h => {
      if (used.has(h)) return false;
      const n = normalizeHeader(h);
      return SYNONYMS[field].some(s => n.includes(s) || s.includes(n));
    });
    if (match) { mapping[field] = match; used.add(match); }
  });
  return mapping;
};

const EMPTY_MAPPING: Record<FieldKey, string> = {
  name: "", email: "", class: "", rollNo: "", parentPhone: "", admissionDate: "",
};

const ITEMS_PER_PAGE = 10;

// ═══════════════════════════════════════════════════════════════════════
// MOCK DATA — flip USE_MOCK_DATA to false to restore live Firestore data
// ═══════════════════════════════════════════════════════════════════════
const USE_MOCK_DATA = true;

const _mockInitials = (n: string) => n.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

// 12 classes matching the Dashboard heatmap (with same averages for consistency)
const MOCK_CLASSES: any[] = [
  { id: "cls-6a",  name: "Grade 6A",  teacherId: "t-vandana", teacherName: "Mrs. Vandana Singh",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-6b",  name: "Grade 6B",  teacherId: "t-rohit",   teacherName: "Mr. Rohit Mishra",     schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-7a",  name: "Grade 7A",  teacherId: "t-meena",   teacherName: "Mrs. Meena Kapoor",    schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-7b",  name: "Grade 7B",  teacherId: "t-arjun",   teacherName: "Mr. Arjun Bhatt",      schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-7c",  name: "Grade 7C",  teacherId: "t-deepa",   teacherName: "Mrs. Deepa Nair",      schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-8a",  name: "Grade 8A",  teacherId: "t-sandeep", teacherName: "Mr. Sandeep Joshi",    schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-8b",  name: "Grade 8B",  teacherId: "t-priya",   teacherName: "Mrs. Priya Mehta",     schoolId: "mock-school-001", branchId: "mock-branch-001" }, // Aarav's class
  { id: "cls-8c",  name: "Grade 8C",  teacherId: "t-suresh",  teacherName: "Mr. Suresh Kulkarni",  schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-9a",  name: "Grade 9A",  teacherId: "t-anita",   teacherName: "Mrs. Anita Choudhury", schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-9b",  name: "Grade 9B",  teacherId: "t-vikash",  teacherName: "Mr. Vikash Kumar",     schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-10a", name: "Grade 10A", teacherId: "t-rashmi",  teacherName: "Mrs. Rashmi Pandey",   schoolId: "mock-school-001", branchId: "mock-branch-001" },
  { id: "cls-10b", name: "Grade 10B", teacherId: "t-faisal",  teacherName: "Mr. Faisal Ahmed",     schoolId: "mock-school-001", branchId: "mock-branch-001" },
];

// 28 students with realistic Indian names across grades. Mix of high & low attendance.
// Aarav Sharma (cls-8b, Roll 23, 92% att) matches parent-dashboard exactly.
const _STUDENTS_RAW = [
  // Grade 6A
  { id: "stu-001", name: "Saanvi Bose",      email: "saanvi.bose@example.com",      classId: "cls-6a",  rollNo: "06", parentPhone: "+91 98765 11001", admissionDate: "2024-04-15", attPct: 46 }, // at-risk (matches Dashboard alert)
  { id: "stu-002", name: "Aryan Kapoor",     email: "aryan.kapoor@example.com",     classId: "cls-6a",  rollNo: "12", parentPhone: "+91 98765 11002", admissionDate: "2024-04-15", attPct: 88 },
  // Grade 6B
  { id: "stu-003", name: "Tara Iyer",        email: "tara.iyer@example.com",        classId: "cls-6b",  rollNo: "08", parentPhone: "+91 98765 11003", admissionDate: "2024-04-15", attPct: 72 },
  { id: "stu-004", name: "Veer Khanna",      email: "veer.khanna@example.com",      classId: "cls-6b",  rollNo: "21", parentPhone: "+91 98765 11004", admissionDate: "2024-04-15", attPct: 65 },
  // Grade 7A
  { id: "stu-005", name: "Riya Patel",       email: "riya.patel@example.com",       classId: "cls-7a",  rollNo: "04", parentPhone: "+91 98765 11005", admissionDate: "2023-04-10", attPct: 95 },
  { id: "stu-006", name: "Karthik Menon",    email: "karthik.menon@example.com",    classId: "cls-7a",  rollNo: "17", parentPhone: "+91 98765 11006", admissionDate: "2023-04-10", attPct: 90 },
  // Grade 7B
  { id: "stu-007", name: "Pranav Desai",     email: "pranav.desai@example.com",     classId: "cls-7b",  rollNo: "09", parentPhone: "+91 98765 11007", admissionDate: "2023-04-10", attPct: 78 }, // matches Dashboard alert (low score)
  { id: "stu-008", name: "Diya Reddy",       email: "diya.reddy@example.com",       classId: "cls-7b",  rollNo: "14", parentPhone: "+91 98765 11008", admissionDate: "2023-04-10", attPct: 89 },
  // Grade 7C
  { id: "stu-009", name: "Rohit Yadav",      email: "rohit.yadav@example.com",      classId: "cls-7c",  rollNo: "11", parentPhone: "+91 98765 11009", admissionDate: "2023-04-10", attPct: 48 }, // critical at-risk (matches Dashboard alert)
  { id: "stu-010", name: "Naina Singhania",  email: "naina.singhania@example.com",  classId: "cls-7c",  rollNo: "19", parentPhone: "+91 98765 11010", admissionDate: "2023-04-10", attPct: 82 },
  // Grade 8A
  { id: "stu-011", name: "Ishaan Khanna",    email: "ishaan.khanna@example.com",    classId: "cls-8a",  rollNo: "14", parentPhone: "+91 98765 11011", admissionDate: "2022-04-12", attPct: 85 },
  { id: "stu-012", name: "Meera Pillai",     email: "meera.pillai@example.com",     classId: "cls-8a",  rollNo: "18", parentPhone: "+91 98765 11012", admissionDate: "2022-04-12", attPct: 91 },
  // Grade 8B (Aarav's class — main character)
  { id: "stu-013", name: "Aarav Sharma",     email: "aarav.sharma@example.com",     classId: "cls-8b",  rollNo: "23", parentPhone: "+91 98765 43210", admissionDate: "2022-04-12", attPct: 92 }, // ★ matches parent-dashboard exactly
  { id: "stu-014", name: "Ananya Iyer",      email: "ananya.iyer@example.com",      classId: "cls-8b",  rollNo: "07", parentPhone: "+91 98765 11014", admissionDate: "2022-04-12", attPct: 96 },
  { id: "stu-015", name: "Diya Menon",       email: "diya.menon@example.com",       classId: "cls-8b",  rollNo: "08", parentPhone: "+91 98765 11015", admissionDate: "2022-04-12", attPct: 94 },
  { id: "stu-016", name: "Rhea Patel",       email: "rhea.patel@example.com",       classId: "cls-8b",  rollNo: "26", parentPhone: "+91 98765 11016", admissionDate: "2022-04-12", attPct: 95 },
  { id: "stu-017", name: "Saanvi Gupta",     email: "saanvi.gupta@example.com",     classId: "cls-8b",  rollNo: "28", parentPhone: "+91 98765 11017", admissionDate: "2022-04-12", attPct: 97 },
  // Grade 8C
  { id: "stu-018", name: "Karan Malhotra",   email: "karan.malhotra@example.com",   classId: "cls-8c",  rollNo: "15", parentPhone: "+91 98765 11018", admissionDate: "2022-04-12", attPct: 73 }, // matches Dashboard alert
  { id: "stu-019", name: "Vihaan Mehta",     email: "vihaan.mehta@example.com",     classId: "cls-8c",  rollNo: "32", parentPhone: "+91 98765 11019", admissionDate: "2022-04-12", attPct: 86 },
  // Grade 9A
  { id: "stu-020", name: "Aditi Joshi",      email: "aditi.joshi@example.com",      classId: "cls-9a",  rollNo: "05", parentPhone: "+91 98765 11020", admissionDate: "2021-04-08", attPct: 64 }, // at-risk (matches Dashboard alert)
  { id: "stu-021", name: "Shreya Bansal",    email: "shreya.bansal@example.com",    classId: "cls-9a",  rollNo: "22", parentPhone: "+91 98765 11021", admissionDate: "2021-04-08", attPct: 93 },
  // Grade 9B
  { id: "stu-022", name: "Aditya Sinha",     email: "aditya.sinha@example.com",     classId: "cls-9b",  rollNo: "10", parentPhone: "+91 98765 11022", admissionDate: "2021-04-08", attPct: 88 },
  { id: "stu-023", name: "Kavya Rao",        email: "kavya.rao@example.com",        classId: "cls-9b",  rollNo: "16", parentPhone: "+91 98765 11023", admissionDate: "2021-04-08", attPct: 80 },
  // Grade 10A
  { id: "stu-024", name: "Aditya Chopra",    email: "aditya.chopra@example.com",    classId: "cls-10a", rollNo: "03", parentPhone: "+91 98765 11024", admissionDate: "2020-04-10", attPct: 97 },
  { id: "stu-025", name: "Sanya Bhatia",     email: "sanya.bhatia@example.com",     classId: "cls-10a", rollNo: "20", parentPhone: "+91 98765 11025", admissionDate: "2020-04-10", attPct: 94 },
  { id: "stu-026", name: "Yuvraj Saxena",    email: "yuvraj.saxena@example.com",    classId: "cls-10a", rollNo: "30", parentPhone: "+91 98765 11026", admissionDate: "2020-04-10", attPct: 89 },
  // Grade 10B
  { id: "stu-027", name: "Tanvi Agarwal",    email: "tanvi.agarwal@example.com",    classId: "cls-10b", rollNo: "13", parentPhone: "+91 98765 11027", admissionDate: "2020-04-10", attPct: 85 },
  { id: "stu-028", name: "Krishna Bhardwaj", email: "krishna.bhardwaj@example.com", classId: "cls-10b", rollNo: "24", parentPhone: "+91 98765 11028", admissionDate: "2020-04-10", attPct: 91 },
];

// Build the merged shape that the page's `merge()` would produce
const MOCK_STUDENTS_DATA = _STUDENTS_RAW.map(s => {
  const cls = MOCK_CLASSES.find(c => c.id === s.classId);
  return {
    ...s,
    studentId:    s.id,
    studentEmail: s.email,
    studentName:  s.name,
    className:    cls?.name || "—",
    teacherId:    cls?.teacherId || "",
    teacherName:  cls?.teacherName || "",
    schoolId:     "mock-school-001",
    branchId:     "mock-branch-001",
    status:       "Active",
    initials:     _mockInitials(s.name),
    gradeDisplay: cls?.name || "—",
    faculty:      cls?.teacherName || "—",
    attendance:   `${s.attPct}%`,
    isAtRisk:     s.attPct < 75,
  };
}).sort((a, b) => {
  if (a.isAtRisk && !b.isAtRisk) return -1;
  if (!a.isAtRisk && b.isAtRisk) return 1;
  return a.name.localeCompare(b.name);
});

const Students = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [studentsData, setStudentsData]     = useState<any[]>(USE_MOCK_DATA ? MOCK_STUDENTS_DATA : []);
  const [classes, setClasses]               = useState<any[]>(USE_MOCK_DATA ? MOCK_CLASSES : []);
  const [loading, setLoading]               = useState(USE_MOCK_DATA ? false : true);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [searchTerm, setSearchTerm]         = useState("");
  const [currentPage, setCurrentPage]       = useState(1);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [newStudent, setNewStudent]         = useState({ name: "", email: "", classId: "" });
  const [atRiskFilter, setAtRiskFilter]     = useState(false);
  const [classFilter, setClassFilter]       = useState("ALL");

  // Bulk upload
  const [showBulkModal, setShowBulkModal]   = useState(false);
  const [bulkRows, setBulkRows]             = useState<BulkStudent[]>([]);
  const [bulkUploading, setBulkUploading]   = useState(false);
  const bulkFileRef = useRef<HTMLInputElement>(null);
  // Raw uploaded rows + headers + canonical→header mapping. The mapping is
  // auto-detected from headers; the user can override via dropdowns. `bulkRows`
  // is rebuilt from these whenever mapping changes (see effect below).
  const [bulkRawRows, setBulkRawRows]       = useState<Record<string, unknown>[]>([]);
  const [bulkHeaders, setBulkHeaders]       = useState<string[]>([]);
  const [bulkMapping, setBulkMapping]       = useState<Record<FieldKey, string>>(EMPTY_MAPPING);

  // Academic year archiving
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiving, setArchiving]               = useState(false);
  const [archiveYear, setArchiveYear]           = useState(new Date().getFullYear().toString());

  // Hold latest snapshots in refs so merges are instant
  const attRef        = useRef<any[]>([]);
  const enrollRef     = useRef<any[]>([]);
  const studentRef    = useRef<any[]>([]);
  const teacherMapRef = useRef<Map<string, string>>(new Map()); // teacherId → teacherName

  // ── helpers ─────────────────────────────────────────────────────────────────

  const computeAttendance = (s: any): { display: string; pct: number | null } => {
    const email = (s.email || s.studentEmail || "").toLowerCase();
    const id    = s.id || s.studentId;
    const recs  = attRef.current.filter(r =>
      (id    && r.studentId === id) ||
      (email && r.studentEmail?.toLowerCase() === email)
    );
    if (recs.length === 0) return { display: "—", pct: null };
    const present = recs.filter(r => r.status === "present" || r.status === "late").length;
    const pct = Math.round((present / recs.length) * 100);
    return { display: `${pct}%`, pct };
  };

  const merge = () => {
    const map = new Map<string, any>();

    // A. students collection (authoritative)
    studentRef.current.forEach(d => {
      const key = (d.email || d.studentEmail || d.id).toLowerCase();
      map.set(key, { ...d });
    });

    // B. enrollments collection (fill gaps)
    enrollRef.current.forEach(d => {
      const key = (d.studentEmail || d.email || d.studentId || d.id).toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: d.studentId || d.id,
          name: d.studentName || d.name || "Unknown",
          email: d.studentEmail || d.email || "",
          classId: d.classId || "",
          className: d.className || "",
          schoolId: d.schoolId || "",
          branchId: d.branchId || "",
          teacherName: d.teacherName || "",
          status: "Active",
          ...d,
        });
      } else {
        const ex = map.get(key)!;
        map.set(key, {
          ...ex,
          className:   ex.className   || d.className   || "",
          classId:     ex.classId     || d.classId     || "",
          teacherName: ex.teacherName || d.teacherName || "",
        });
      }
    });

    const list = Array.from(map.values())
      .map(s => {
        const att = computeAttendance(s);
        const isAtRisk = (att.pct !== null && att.pct < 75);
        return {
          ...s,
          name:         s.name || s.studentName || "Unknown",
          initials:     (s.name || s.studentName || "S")
                          .split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
          gradeDisplay: s.className || s.classId || "—",
          status:       s.status || "Active",
          faculty:      teacherMapRef.current.get(s.teacherId) || s.teacherName || "—",
          attendance:   att.display,
          attPct:       att.pct,
          isAtRisk,
        };
      })
      .sort((a, b) => {
        // At-risk students first, then alphabetical
        if (a.isAtRisk && !b.isAtRisk) return -1;
        if (!a.isAtRisk && b.isAtRisk) return 1;
        return a.name.localeCompare(b.name);
      });

    setStudentsData(list);
    setLoading(false);
  };

  // ── Firestore listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    if (USE_MOCK_DATA) return; // Mock mode: studentsData + classes pre-seeded above
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    setLoading(true);

    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];

    const unsubEnroll = onSnapshot(query(collection(db, "enrollments"), ...C), snap => {
      enrollRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

    const unsubStudents = onSnapshot(query(collection(db, "students"), ...C), snap => {
      studentRef.current = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      merge();
    });

    const unsubAtt = onSnapshot(query(collection(db, "attendance"), ...C), snap => {
      attRef.current = snap.docs.map(d => d.data());
      merge();
    });

    const unsubCls = onSnapshot(query(collection(db, "classes"), ...C), snap => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Teachers — build id→name map so enrollment rows show correct faculty
    const unsubTeachers = onSnapshot(query(collection(db, "teachers"), ...C), snap => {
      const m = new Map<string, string>();
      snap.docs.forEach(d => {
        const t = d.data();
        if (t.name) m.set(d.id, t.name);
      });
      teacherMapRef.current = m;
      merge();
    });

    return () => { unsubEnroll(); unsubStudents(); unsubAtt(); unsubCls(); unsubTeachers(); };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Add student ──────────────────────────────────────────────────────────────

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.classId) {
      return toast.error("Name and Class are required.");
    }
    if (!newStudent.email) {
      return toast.error("Email is required to enroll a student.");
    }
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");

    const cls = classes.find(c => c.id === newStudent.classId);
    const sid = newStudent.email.toLowerCase().trim();
    const studentName = newStudent.name.trim();

    setSaving(true);
    try {
      // 1. Add to students collection — capture the auto-generated doc ID so we
      // can use it as the canonical studentId everywhere downstream. Previously
      // we used `email` as `studentId`, which broke the parent-dashboard reads
      // (those query enrollments by `studentData.id`, the actual doc ID, not email).
      const studentDocRef = await addDoc(collection(db, "students"), {
        name:        studentName,
        email:       sid,
        studentId:   sid, // legacy — kept so existing reads matching by email keep working
        classId:     newStudent.classId,
        className:   cls?.name || "",
        teacherId:   cls?.teacherId || "",
        teacherName: cls?.teacherName || "",
        schoolId,
        branchId,
        status:      "Active",
        createdAt:   serverTimestamp(),
      });

      // 2. Add to enrollments — must reference the real student doc ID so that
      // parent-dashboard's `where('studentId', '==', studentData.id)` matches.
      await addDoc(collection(db, "enrollments"), {
        studentId:    studentDocRef.id,
        studentEmail: sid,
        studentName:  studentName,
        classId:      newStudent.classId,
        className:    cls?.name || "",
        teacherId:    cls?.teacherId || "",
        teacherName:  cls?.teacherName || "",
        schoolId,
        branchId,
        createdAt:    serverTimestamp(),
      });

      // 3. Send welcome email (non-blocking — don't fail enrollment if email fails)
      if (sid) {
        fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: sid,
            subject: `You've been enrolled — ${cls?.name || "Class"} | ${userData?.schoolName || "School"}`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px;">
                <h2 style="color:#1D1D1F;margin-bottom:8px;">Welcome, ${studentName}!</h2>
                <p style="color:#555;">You have been enrolled in <strong>${cls?.name || "your class"}</strong>.</p>
                <table style="margin:20px 0;width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;color:#888;font-size:13px;">School</td><td style="font-weight:bold;color:#333;">${userData?.schoolName || schoolId}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;font-size:13px;">Class</td><td style="font-weight:bold;color:#333;">${cls?.name || "—"}</td></tr>
                  ${cls?.teacherName ? `<tr><td style="padding:8px 0;color:#888;font-size:13px;">Teacher</td><td style="font-weight:bold;color:#333;">${cls.teacherName}</td></tr>` : ""}
                </table>
                <div style="margin:28px 0;text-align:center;">
                  <a href="https://parent-dashboard-ten.vercel.app/" style="background:#1D1D1F;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">
                    Login to Student Portal
                  </a>
                </div>
                <p style="color:#aaa;font-size:12px;text-align:center;">Use your email (${sid}) to sign in.</p>
              </div>
            `,
          }),
        }).catch(() => {}); // silent fail — enrollment already saved
      }

      toast.success(`${studentName} enrolled & invitation sent!`);
      setIsAddModalOpen(false);
      setNewStudent({ name: "", email: "", classId: "" });
    } catch {
      toast.error("Enrollment failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Bulk Upload ──────────────────────────────────────────────────────────────

  const parseBulkFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        if (rows.length === 0) {
          toast.warning("File is empty or has no readable rows.");
          return;
        }
        // Headers come from the first row's keys (XLSX preserves original order)
        const headers = Object.keys(rows[0]);
        setBulkRawRows(rows);
        setBulkHeaders(headers);
        setBulkMapping(detectColumns(headers));
      } catch (err: any) {
        toast.error("Could not read file: " + (err?.message || "unknown error"));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Re-build typed bulkRows whenever the user changes the mapping
  // (or after parseBulkFile sets the auto-detected mapping).
  useEffect(() => {
    if (bulkRawRows.length === 0) {
      setBulkRows([]);
      return;
    }
    const m = bulkMapping;
    const pick = (r: Record<string, unknown>, key: string) =>
      key && r[key] !== undefined && r[key] !== null ? String(r[key]) : "";
    const parsed: BulkStudent[] = bulkRawRows
      .map((r): BulkStudent => ({
        name:          pick(r, m.name).trim(),
        email:         pick(r, m.email).trim().toLowerCase(),
        class:         pick(r, m.class).trim(),
        rollNo:        pick(r, m.rollNo).trim(),
        parentPhone:   pick(r, m.parentPhone).trim(),
        admissionDate: pick(r, m.admissionDate).trim(),
        _status:       "pending",
      }))
      .filter(r => r.name && r.email);
    setBulkRows(parsed);
  }, [bulkRawRows, bulkMapping]);

  const downloadTemplate = () => {
    const ws  = XLSX.utils.json_to_sheet(TEMPLATE_DATA);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.writeFile(wb, "student_upload_template.xlsx");
  };

  const handleBulkUpload = async () => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");
    if (bulkRows.length === 0) return;

    setBulkUploading(true);

    // Build existing email set for duplicate detection
    const existingEmails = new Set(
      studentsData.map(s => (s.email || s.studentEmail || "").toLowerCase())
    );

    // Mark duplicates before writing
    const tagged = bulkRows.map(r => ({
      ...r,
      _status: existingEmails.has(r.email) ? ("duplicate" as const) : ("pending" as const),
    }));
    setBulkRows(tagged);

    const toWrite = tagged.filter(r => r._status === "pending");
    if (toWrite.length === 0) {
      toast.warning("All rows are duplicates — nothing to upload.");
      setBulkUploading(false);
      return;
    }

    // Firestore batch limit is 500 ops; 2 docs per student → 250 students per batch
    const BATCH_SIZE = 200;
    let successCount = 0;

    try {
      for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
        const chunk = toWrite.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        chunk.forEach(r => {
          // Find classId by class name match
          const cls = classes.find(c =>
            c.name?.toLowerCase() === r.class?.toLowerCase() ||
            c.id?.toLowerCase()   === r.class?.toLowerCase()
          );

          const studentDocRef = doc(collection(db, "students"));
          batch.set(studentDocRef, {
            name:          r.name,
            email:         r.email,
            studentId:     r.email,
            classId:       cls?.id || r.class || "",
            className:     cls?.name || r.class || "",
            teacherId:     cls?.teacherId || "",
            teacherName:   cls?.teacherName || "",
            rollNo:        r.rollNo || "",
            parentPhone:   r.parentPhone || "",
            admissionDate: r.admissionDate || "",
            schoolId,
            branchId,
            status:        "Active",
            createdAt:     serverTimestamp(),
          });

          const enrollDocRef = doc(collection(db, "enrollments"));
          batch.set(enrollDocRef, {
            studentId:    r.email,
            studentEmail: r.email,
            studentName:  r.name,
            classId:      cls?.id || r.class || "",
            className:    cls?.name || r.class || "",
            teacherId:    cls?.teacherId || "",
            teacherName:  cls?.teacherName || "",
            schoolId,
            branchId,
            createdAt:    serverTimestamp(),
          });
        });

        await batch.commit();
        successCount += chunk.length;

        // Fire invite emails in parallel — don't await so it doesn't slow the upload
        Promise.allSettled(
          chunk
            .filter(r => !!r.email)
            .map(r => {
              const cls = classes.find(c =>
                c.name?.toLowerCase() === r.class?.toLowerCase() ||
                c.id?.toLowerCase()   === r.class?.toLowerCase()
              );
              return sendEmail({
                to: r.email,
                subject: `You've been enrolled${cls ? ` — ${cls.name}` : ""}`,
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:0;border:1px solid #EBEBF0;border-radius:12px;overflow:hidden;">
                    <div style="background:#1D1D1F;padding:24px 28px;">
                      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">EDULLENT</h1>
                      <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">Student Portal Invitation</p>
                    </div>
                    <div style="padding:28px;background:#fff;">
                      <h2 style="color:#1D1D1F;margin:0 0 12px;">Welcome, ${r.name}!</h2>
                      <p style="color:#6E6E73;font-size:14px;line-height:1.6;margin:0 0 8px;">
                        You have been enrolled${cls ? ` in <strong>${cls.name}</strong>${cls.teacherName ? ` — Teacher: <strong>${cls.teacherName}</strong>` : ""}` : " at your school"}.
                      </p>
                      <p style="color:#6E6E73;font-size:14px;line-height:1.6;margin:0 0 24px;">
                        Log in with this email address (<strong>${r.email}</strong>) to access your student portal.
                      </p>
                      <div style="text-align:center;margin:24px 0;">
                        <a href="https://parent-dashboard-ten.vercel.app/"
                           style="background:#1D1D1F;color:#fff;padding:13px 30px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
                          Go to Student Portal
                        </a>
                      </div>
                    </div>
                    <div style="background:#F5F5F7;padding:14px 28px;text-align:center;">
                      <p style="color:#A1A1A6;font-size:11px;margin:0;">Powered by Edullent Cloud Architecture</p>
                    </div>
                  </div>
                `,
              });
            })
        ); // intentionally not awaited — emails sent in background
      }

      setBulkRows(prev => prev.map(r =>
        r._status === "pending" ? { ...r, _status: "success" as const } : r
      ));
      toast.success(`${successCount} students uploaded & invite emails sent!`);
    } catch (e: any) {
      toast.error("Bulk upload failed: " + e.message);
      setBulkRows(prev => prev.map(r =>
        r._status === "pending" ? { ...r, _status: "error" as const, _error: e.message } : r
      ));
    }
    setBulkUploading(false);
  };

  // ── Academic Year Archive ────────────────────────────────────────────────────

  const handleArchive = async () => {
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) return toast.error("School context missing.");

    setArchiving(true);
    try {
      const snap = await getDocs(
        query(collection(db, "students"), where("schoolId", "==", schoolId), where("branchId", "==", branchId))
      );

      if (snap.empty) {
        toast.warning("No students to archive.");
        setArchiving(false);
        return;
      }

      // Archive in chunks of 400 (each student = 1 write to archive)
      const BATCH_SIZE = 400;
      const docs = snap.docs;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const chunk = docs.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(d => {
          const archiveRef = doc(db, "students_archive", archiveYear, "students", d.id);
          batch.set(archiveRef, {
            ...d.data(),
            archivedAt:  serverTimestamp(),
            archiveYear: archiveYear,
          });
        });
        await batch.commit();
      }

      toast.success(`${docs.length} students archived to year ${archiveYear}!`);
      setShowArchiveModal(false);
    } catch (e: any) {
      toast.error("Archive failed: " + e.message);
    }
    setArchiving(false);
  };

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = () => {
    const headers = ["Name", "Email", "Class", "Branch", "Faculty", "Attendance", "Status"];
    const rows = studentsData.map(s => [
      s.name,
      s.email || s.studentEmail || "",
      s.gradeDisplay,
      s.branchId || userData?.branchId || "",
      s.faculty,
      s.attendance,
      s.status,
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "students_export.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Export complete!");
  };

  // ── Pagination & filter ──────────────────────────────────────────────────────

  const filtered = studentsData.filter(s => {
    const matchSearch =
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.gradeDisplay?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.email || s.studentEmail || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchRisk = !atRiskFilter || s.isAtRisk;
    const matchClass = classFilter === "ALL" || (s.gradeDisplay || "—") === classFilter;
    return matchSearch && matchRisk && matchClass;
  });

  const classOptions = Array.from(
    new Set(studentsData.map(s => s.gradeDisplay).filter(Boolean))
  ).sort();

  const atRiskCount = studentsData.filter(s => s.isAtRisk).length;
  // When a class filter is active, show every student of that class — skip pagination.
  const showAllForClass = classFilter !== "ALL";
  const totalPages = showAllForClass
    ? 1
    : Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated = showAllForClass
    ? filtered
    : filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Reset to page 1 when search or class filter changes
  useEffect(() => setCurrentPage(1), [searchTerm, classFilter]);

  // ── Student profile view ─────────────────────────────────────────────────────

  if (selectedStudent) {
    // Navigate to JARVIS HUD profile page
    navigate(`/students/${selectedStudent.id}`);
    setSelectedStudent(null);
    return null;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: "#F5F5F7" }}>
    <div className={isMobile ? "animate-in fade-in duration-500" : "space-y-8 animate-in fade-in duration-500 pb-10 text-left"}>

      {isMobile ? (() => {
        // Aggregate stats for the mobile UI's stat strip + dark summary card.
        // Computed only on the mobile path to avoid touching desktop wiring.
        const activeCount = studentsData.filter((s: any) => (s.status || "Active") === "Active").length;
        const _validAtt = studentsData
          .map((s: any) => s.attPct)
          .filter((p: any): p is number => typeof p === "number");
        const avgAttendance = _validAtt.length > 0
          ? Math.round(_validAtt.reduce((a: number, b: number) => a + b, 0) / _validAtt.length)
          : null;
        const teachersCount = new Set(
          studentsData.map((s: any) => s.faculty).filter((f: any) => f && f !== "—")
        ).size;
        const gradesCount = new Set(
          studentsData.map((s: any) => s.gradeDisplay).filter(Boolean)
        ).size;

        return (
          <StudentsMobile
            studentsTotal={studentsData.length}
            loading={loading}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            atRiskFilter={atRiskFilter}
            atRiskCount={atRiskCount}
            toggleAtRisk={() => { setAtRiskFilter(f => !f); setCurrentPage(1); }}
            filteredCount={filtered.length}
            paginated={paginated as any}
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={ITEMS_PER_PAGE}
            setCurrentPage={setCurrentPage}
            onAddClick={() => setIsAddModalOpen(true)}
            onExportClick={handleExport}
            onBulkClick={() => { setBulkRows([]); setBulkRawRows([]); setBulkHeaders([]); setBulkMapping(EMPTY_MAPPING); setShowBulkModal(true); }}
            onArchiveClick={() => setShowArchiveModal(true)}
            onProfileClick={s => setSelectedStudent(s)}
            defaultBranchId={userData?.branchId}
            activeCount={activeCount}
            avgAttendance={avgAttendance}
            teachersCount={teachersCount}
            gradesCount={gradesCount}
          />
        );
      })() : (
      <DesktopStudentsView
        studentsData={studentsData}
        paginated={paginated as any[]}
        filtered={filtered}
        loading={loading}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        atRiskFilter={atRiskFilter}
        atRiskCount={atRiskCount}
        setAtRiskFilter={setAtRiskFilter}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        classOptions={classOptions}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        itemsPerPage={ITEMS_PER_PAGE}
        onAdd={() => setIsAddModalOpen(true)}
        onExport={handleExport}
        onBulk={() => { setBulkRows([]); setBulkRawRows([]); setBulkHeaders([]); setBulkMapping(EMPTY_MAPPING); setShowBulkModal(true); }}
        onArchive={() => setShowArchiveModal(true)}
        onProfileClick={(s) => setSelectedStudent(s)}
        onMessageClick={(s) => navigate("/parent-communication", { state: { studentId: s.id, studentName: s.name } })}
        defaultBranchId={userData?.branchId}
      />
      )}

      {/* ── Bulk Upload Modal ────────────────────────────────────────────── */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowBulkModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="bg-emerald-700 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-normal text-white">Bulk Student Upload</h2>
                  <p className="text-xs text-emerald-200">Upload Excel / CSV to enroll multiple students</p>
                </div>
              </div>
              <button onClick={() => setShowBulkModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Upload zone */}
              <div className="border-2 border-dashed border-emerald-200 rounded-2xl p-6 text-center bg-emerald-50/40 hover:bg-emerald-50 transition-colors cursor-pointer"
                onClick={() => bulkFileRef.current?.click()}>
                <Upload className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs font-normal text-emerald-700 uppercase tracking-widest">Click to select Excel / CSV file</p>
                <p className="text-[12px] text-slate-400 mt-1">Any column headers — system auto-detects & lets you re-map below</p>
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) parseBulkFile(e.target.files[0]); e.target.value = ""; }}
                />
              </div>

              {/* Template download */}
              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-emerald-200 text-xs font-normal text-emerald-600 hover:bg-emerald-50 transition-colors">
                <Download className="w-4 h-4" /> Download Default Template
              </button>

              {/* Column mapping — appears once a file is parsed */}
              {bulkHeaders.length > 0 && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[12px] font-normal text-slate-500 uppercase tracking-widest">Column Mapping</p>
                      <p className="text-[12px] text-slate-400 mt-1">
                        {bulkHeaders.length} columns detected · auto-matched · adjust if anything looks off
                      </p>
                    </div>
                    <button
                      onClick={() => setBulkMapping(detectColumns(bulkHeaders))}
                      className="text-[12px] font-normal text-emerald-700 hover:text-emerald-800 uppercase tracking-wider px-2 py-1 rounded-md hover:bg-emerald-100 transition-colors">
                      Auto-match
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Object.keys(FIELD_LABELS) as FieldKey[]).map(field => {
                      const cfg = FIELD_LABELS[field];
                      const value = bulkMapping[field] || "";
                      const ok = value !== "";
                      return (
                        <div key={field} className="flex items-center gap-2">
                          <label className="text-[12px] font-normal text-slate-600 uppercase tracking-wider w-[88px] shrink-0">
                            {cfg.label}{cfg.required && <span className="text-rose-500"> *</span>}
                          </label>
                          <select
                            value={value}
                            onChange={e => setBulkMapping(prev => ({ ...prev, [field]: e.target.value }))}
                            className={`flex-1 text-xs font-normal rounded-lg border px-2 py-1.5 bg-white outline-none transition-colors ${
                              cfg.required && !ok
                                ? "border-rose-300 text-rose-600 focus:border-rose-400"
                                : ok
                                ? "border-emerald-200 text-slate-700 focus:border-emerald-400"
                                : "border-slate-200 text-slate-500 focus:border-slate-400"
                            }`}>
                            <option value="">— skip / not in file —</option>
                            {bulkHeaders.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  {(!bulkMapping.name || !bulkMapping.email) && (
                    <p className="text-[12px] font-normal text-rose-600 mt-3">
                      ⚠ Both <strong>Name</strong> and <strong>Email</strong> must be mapped before uploading.
                    </p>
                  )}
                </div>
              )}

              {/* Preview table */}
              {bulkRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[12px] font-normal text-slate-500 uppercase tracking-widest">{bulkRows.length} rows detected</p>
                    <div className="flex gap-2 text-[12px] font-normal uppercase">
                      <span className="text-slate-400">{bulkRows.filter(r => r._status === "pending").length} pending</span>
                      <span className="text-emerald-600">{bulkRows.filter(r => r._status === "success").length} done</span>
                      <span className="text-amber-500">{bulkRows.filter(r => r._status === "duplicate").length} dup</span>
                      <span className="text-rose-500">{bulkRows.filter(r => r._status === "error").length} err</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left">
                          <th className="px-3 py-2 text-[12px] font-normal text-slate-400 uppercase">Name</th>
                          <th className="px-3 py-2 text-[12px] font-normal text-slate-400 uppercase">Email</th>
                          <th className="px-3 py-2 text-[12px] font-normal text-slate-400 uppercase">Class</th>
                          <th className="px-3 py-2 text-[12px] font-normal text-slate-400 uppercase text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {bulkRows.slice(0, 50).map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 font-normal text-slate-700 truncate max-w-[120px]">{r.name}</td>
                            <td className="px-3 py-2 text-slate-400 truncate max-w-[160px]">{r.email}</td>
                            <td className="px-3 py-2 text-slate-500">{r.class || "—"}</td>
                            <td className="px-3 py-2 text-center">
                              {r._status === "pending"   && <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[12px] font-normal">PENDING</span>}
                              {r._status === "success"   && <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-600 text-[12px] font-normal">DONE</span>}
                              {r._status === "duplicate" && <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-600 text-[12px] font-normal">DUP</span>}
                              {r._status === "error"     && <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-600 text-[12px] font-normal" title={r._error}>ERR</span>}
                            </td>
                          </tr>
                        ))}
                        {bulkRows.length > 50 && (
                          <tr><td colSpan={4} className="px-3 py-2 text-center text-[12px] text-slate-400">+{bulkRows.length - 50} more rows</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button onClick={() => {
                    setShowBulkModal(false);
                    setBulkRows([]); setBulkRawRows([]); setBulkHeaders([]); setBulkMapping(EMPTY_MAPPING);
                  }}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-normal text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpload}
                  disabled={
                    bulkUploading ||
                    !bulkMapping.name || !bulkMapping.email ||
                    bulkRows.filter(r => r._status === "pending").length === 0
                  }
                  className="flex-1 h-11 rounded-xl bg-emerald-700 text-white text-xs font-normal hover:bg-emerald-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {bulkUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {bulkUploading ? "Uploading..." : `Upload ${bulkRows.filter(r => r._status === "pending").length} Students`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Year Modal ───────────────────────────────────────────── */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !archiving && setShowArchiveModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="bg-amber-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Archive className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-normal text-white">Archive Academic Year</h2>
                  <p className="text-xs text-amber-200">Snapshot all students to archive collection</p>
                </div>
              </div>
              {!archiving && (
                <button onClick={() => setShowArchiveModal(false)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
                  <X className="w-4 h-4 text-white" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-normal text-amber-800">
                  This will copy all <strong>{studentsData.length} students</strong> into an archive collection under the selected year.
                  Original records will NOT be deleted — this is a snapshot only.
                </p>
              </div>

              <div>
                <label className="text-[12px] font-normal text-slate-400 uppercase tracking-widest mb-2 block">Archive Year</label>
                <input
                  type="number"
                  value={archiveYear}
                  onChange={e => setArchiveYear(e.target.value)}
                  min="2020"
                  max="2040"
                  className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-normal text-slate-700 outline-none focus:border-amber-400 transition-all"
                />
                <p className="text-[12px] text-slate-400 mt-1">Stored at: students_archive/{archiveYear}/students/...</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowArchiveModal(false)} disabled={archiving}
                  className="flex-1 h-11 rounded-xl border border-slate-100 text-xs font-normal text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-40">
                  Cancel
                </button>
                <button onClick={handleArchive} disabled={archiving}
                  className="flex-1 h-11 rounded-xl bg-amber-600 text-white text-xs font-normal hover:bg-amber-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {archiving ? "Archiving..." : "Archive Now"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Scholar Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[480px] rounded-[2rem] p-0 overflow-hidden bg-white">
          <div className="bg-[#1D1D1F] px-6 sm:px-10 py-6 sm:py-8">
            <DialogTitle className="text-xl sm:text-2xl font-normal text-white tracking-tight flex items-center gap-3">
              <GraduationCap className="w-6 h-6" /> Add New Scholar
            </DialogTitle>
            <DialogDescription className="text-blue-200/60 font-normal uppercase text-[12px] tracking-widest mt-1">
              Institutional Enrollment Registry
            </DialogDescription>
          </div>

          <div className="p-6 sm:p-10 space-y-5">
            <div className="space-y-2">
              <Label className="text-[12px] font-normal uppercase tracking-widest text-slate-500 ml-1">Full Name *</Label>
              <Input
                placeholder="e.g. Rahul Sharma"
                value={newStudent.name}
                onChange={e => setNewStudent({ ...newStudent, name: e.target.value })}
                className="rounded-xl border-slate-200 font-normal py-6 px-5 focus:ring-[#1D1D1F]"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[12px] font-normal uppercase tracking-widest text-slate-500 ml-1">Email</Label>
              <Input
                type="email"
                placeholder="student@example.com"
                value={newStudent.email}
                onChange={e => setNewStudent({ ...newStudent, email: e.target.value })}
                className="rounded-xl border-slate-200 font-normal py-6 px-5"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[12px] font-normal uppercase tracking-widest text-slate-500 ml-1">Class *</Label>
              {classes.length > 0 ? (
                <select
                  value={newStudent.classId}
                  onChange={e => setNewStudent({ ...newStudent, classId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1D1D1F] appearance-none"
                >
                  <option value="">Select a class...</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.grade ? ` — Grade ${c.grade}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm font-normal text-amber-700">
                  No classes found. Ask teacher to create classes first.
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddStudent}
                disabled={saving || !newStudent.name || !newStudent.classId}
                className="flex-1 bg-[#1D1D1F] text-white px-8 py-4 rounded-xl text-[12px] font-normal uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Add Scholar
              </button>
              <button
                onClick={() => { setIsAddModalOpen(false); setNewStudent({ name: "", email: "", classId: "" }); }}
                className="px-8 py-4 rounded-xl text-[12px] font-normal uppercase tracking-widest text-slate-500 bg-slate-50 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
};

export default Students;
