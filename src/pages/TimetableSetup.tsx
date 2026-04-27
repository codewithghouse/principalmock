import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection, query, where, onSnapshot, doc,
  setDoc, serverTimestamp,
} from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import TimetableSetupMobile from "@/components/dashboard/TimetableSetupMobile";
import TimetableSetupDesktop from "@/components/dashboard/TimetableSetupDesktop";

// ── Types ─────────────────────────────────────────────────────────────────────
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Period {
  id: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacherId: string;
  teacherName: string;
  isBreak: boolean;
}

interface DaySchedule {
  [day: string]: Period[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const emptyPeriod = (): Period => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  startTime: "08:00",
  endTime: "08:45",
  subject: "",
  teacherId: "",
  teacherName: "",
  isBreak: false,
});

// ═══════════════════════════════════════════════════════════════════════
// MOCK DATA — flip USE_MOCK_DATA to false to restore live Firestore data
// ═══════════════════════════════════════════════════════════════════════
const USE_MOCK_DATA_TS = true;

// 12 classes
const MOCK_CLASSES_TS: any[] = [
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

// 17 teachers with subject field for fallback lookups
const MOCK_TEACHERS_TS: any[] = [
  { id: "t-priya",   name: "Mrs. Priya Mehta",     subject: "Mathematics" },
  { id: "t-rohit",   name: "Mr. Rohit Mishra",     subject: "Science" },
  { id: "t-meena",   name: "Mrs. Meena Kapoor",    subject: "English" },
  { id: "t-arjun",   name: "Mr. Arjun Bhatt",      subject: "Social Studies" },
  { id: "t-deepa",   name: "Mrs. Deepa Nair",      subject: "Hindi" },
  { id: "t-sandeep", name: "Mr. Sandeep Joshi",    subject: "Physical Education" },
  { id: "t-suresh",  name: "Mr. Suresh Kulkarni",  subject: "Mathematics" },
  { id: "t-anita",   name: "Mrs. Anita Choudhury", subject: "Biology" },
  { id: "t-vikash",  name: "Mr. Vikash Kumar",     subject: "Chemistry" },
  { id: "t-rashmi",  name: "Mrs. Rashmi Pandey",   subject: "Physics" },
  { id: "t-faisal",  name: "Mr. Faisal Ahmed",     subject: "Mathematics" },
  { id: "t-vandana", name: "Mrs. Vandana Singh",   subject: "Mathematics" },
  { id: "t-kiran",   name: "Mr. Kiran Patel",      subject: "English" },
  { id: "t-sunita",  name: "Mrs. Sunita Verma",    subject: "Hindi" },
  { id: "t-anil",    name: "Dr. Anil Reddy",       subject: "Science" },
  { id: "t-rahul",   name: "Mr. Rahul Khanna",     subject: "Social Studies" },
  { id: "t-neha",    name: "Ms. Neha Iyer",        subject: "Computer Science" },
];

// Subject map (flat from teacher.subject)
const MOCK_TEACHER_SUBJECTS_MAP_TS = new Map<string, string[]>(
  MOCK_TEACHERS_TS.map(t => [t.id, [t.subject]]),
);

// Default class = 8B (Aarav's class) — matches parent dashboard
// Pre-built 8B timetable matching parent-dashboard TimetablePage
const _mkPeriod = (idx: number, startTime: string, endTime: string, subject: string, teacherId: string, teacherName: string, isBreak = false) => ({
  id: `p-${idx}`,
  startTime, endTime, subject, teacherId, teacherName, isBreak,
});

const MOCK_8B_SCHEDULE: DaySchedule = {
  Monday: [
    _mkPeriod(1,  "08:30", "09:15", "Mathematics",      "t-priya",   "Mrs. Priya Mehta"),
    _mkPeriod(2,  "09:20", "10:05", "English",          "t-kiran",   "Mr. Kiran Patel"),
    _mkPeriod(3,  "10:10", "10:55", "Hindi",            "t-sunita",  "Mrs. Sunita Verma"),
    _mkPeriod(4,  "10:55", "11:30", "Recess",           "",          "", true),
    _mkPeriod(5,  "11:30", "12:15", "Science",          "t-anil",    "Dr. Anil Reddy"),
    _mkPeriod(6,  "12:20", "13:05", "Social Studies",   "t-rahul",   "Mr. Rahul Khanna"),
    _mkPeriod(7,  "13:05", "13:55", "Lunch",            "",          "", true),
    _mkPeriod(8,  "14:00", "14:45", "Computer Science", "t-neha",    "Ms. Neha Iyer"),
  ],
  Tuesday: [
    _mkPeriod(9,  "08:30", "09:15", "English",          "t-kiran",   "Mr. Kiran Patel"),
    _mkPeriod(10, "09:20", "10:05", "Mathematics",      "t-priya",   "Mrs. Priya Mehta"),
    _mkPeriod(11, "10:10", "10:55", "Science",          "t-anil",    "Dr. Anil Reddy"),
    _mkPeriod(12, "10:55", "11:30", "Recess",           "",          "", true),
    _mkPeriod(13, "11:30", "12:15", "Hindi",            "t-sunita",  "Mrs. Sunita Verma"),
    _mkPeriod(14, "12:20", "13:05", "Computer Lab",     "t-neha",    "Ms. Neha Iyer"),
    _mkPeriod(15, "13:05", "13:55", "Lunch",            "",          "", true),
    _mkPeriod(16, "14:00", "14:45", "Social Studies",   "t-rahul",   "Mr. Rahul Khanna"),
  ],
  Wednesday: [
    _mkPeriod(17, "08:30", "09:15", "Hindi",            "t-sunita",  "Mrs. Sunita Verma"),
    _mkPeriod(18, "09:20", "10:05", "Mathematics",      "t-priya",   "Mrs. Priya Mehta"),
    _mkPeriod(19, "10:10", "10:55", "English",          "t-kiran",   "Mr. Kiran Patel"),
    _mkPeriod(20, "10:55", "11:30", "Recess",           "",          "", true),
    _mkPeriod(21, "11:30", "12:15", "Social Studies",   "t-rahul",   "Mr. Rahul Khanna"),
    _mkPeriod(22, "12:20", "13:05", "Science",          "t-anil",    "Dr. Anil Reddy"),
    _mkPeriod(23, "13:05", "13:55", "Lunch",            "",          "", true),
    _mkPeriod(24, "14:00", "14:45", "Physical Education", "t-sandeep","Mr. Sandeep Joshi"),
  ],
  Thursday: [
    _mkPeriod(25, "08:30", "09:15", "Science",          "t-anil",    "Dr. Anil Reddy"),
    _mkPeriod(26, "09:20", "10:05", "English",          "t-kiran",   "Mr. Kiran Patel"),
    _mkPeriod(27, "10:10", "10:55", "Mathematics",      "t-priya",   "Mrs. Priya Mehta"),
    _mkPeriod(28, "10:55", "11:30", "Recess",           "",          "", true),
    _mkPeriod(29, "11:30", "12:15", "Hindi",            "t-sunita",  "Mrs. Sunita Verma"),
    _mkPeriod(30, "12:20", "13:05", "Social Studies",   "t-rahul",   "Mr. Rahul Khanna"),
    _mkPeriod(31, "13:05", "13:55", "Lunch",            "",          "", true),
    _mkPeriod(32, "14:00", "14:45", "Computer Lab",     "t-neha",    "Ms. Neha Iyer"),
  ],
  Friday: [
    _mkPeriod(33, "08:30", "09:15", "Mathematics",      "t-priya",   "Mrs. Priya Mehta"),
    _mkPeriod(34, "09:20", "10:05", "Hindi",            "t-sunita",  "Mrs. Sunita Verma"),
    _mkPeriod(35, "10:10", "10:55", "Science",          "t-anil",    "Dr. Anil Reddy"),
    _mkPeriod(36, "10:55", "11:30", "Recess",           "",          "", true),
    _mkPeriod(37, "11:30", "12:15", "English",          "t-kiran",   "Mr. Kiran Patel"),
    _mkPeriod(38, "12:20", "13:05", "Computer Science", "t-neha",    "Ms. Neha Iyer"),
    _mkPeriod(39, "13:05", "13:55", "Lunch",            "",          "", true),
    _mkPeriod(40, "14:00", "14:45", "Social Studies",   "t-rahul",   "Mr. Rahul Khanna"),
  ],
  Saturday: [
    _mkPeriod(41, "08:30", "09:15", "Mathematics",      "t-priya",   "Mrs. Priya Mehta"),
    _mkPeriod(42, "09:20", "10:05", "Science",          "t-anil",    "Dr. Anil Reddy"),
    _mkPeriod(43, "10:10", "10:55", "English",          "t-kiran",   "Mr. Kiran Patel"),
    _mkPeriod(44, "10:55", "11:30", "Co-curricular",    "t-sandeep", "Mr. Sandeep Joshi"),
  ],
};

// ── Component ─────────────────────────────────────────────────────────────────
const TimetableSetup = () => {
  const { userData } = useAuth();
  const isMobile = useIsMobile();

  const [classes, setClasses]             = useState<any[]>(USE_MOCK_DATA_TS ? MOCK_CLASSES_TS : []);
  const [teachers, setTeachers]           = useState<any[]>(USE_MOCK_DATA_TS ? MOCK_TEACHERS_TS : []);
  // teacherSubjectsMap: teacherId → string[] (subjects from teaching_assignments)
  const [teacherSubjectsMap, setTeacherSubjectsMap] = useState<Map<string, string[]>>(USE_MOCK_DATA_TS ? MOCK_TEACHER_SUBJECTS_MAP_TS : new Map());
  const [selectedClass, setSelectedClass] = useState<string>(USE_MOCK_DATA_TS ? "cls-8b" : ""); // 8B as default — Aarav's class
  const [schedule, setSchedule]           = useState<DaySchedule>(USE_MOCK_DATA_TS ? MOCK_8B_SCHEDULE : {});
  const [loading, setLoading]             = useState(USE_MOCK_DATA_TS ? false : true);
  const [saving, setSaving]               = useState(false);
  const [expandedDay, setExpandedDay]     = useState<string>("Monday");
  const [viewMode, setViewMode]           = useState<"edit" | "grid">("edit");

  // ── Firestore listeners ────────────────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK_DATA_TS) return; // Mock mode: classes + teachers + subjectsMap pre-seeded above
    const schoolId = userData?.schoolId;
    const branchId = userData?.branchId;
    if (!schoolId || !branchId) { setLoading(false); return; }

    const C = [where("schoolId", "==", schoolId), where("branchId", "==", branchId)];

    const unsubCls = onSnapshot(query(collection(db, "classes"), ...C), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setClasses(list);
      if (list.length > 0 && !selectedClass) setSelectedClass(list[0].id);
      setLoading(false);
    });

    const unsubT = onSnapshot(query(collection(db, "teachers"), ...C), snap => {
      setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // teaching_assignments → build teacherId → subjects[] map
    // Each assignment doc has: teacherId, classId, subjectId / subject / subjectName
    const unsubAssign = onSnapshot(
      query(collection(db, "teaching_assignments"), ...C),
      snap => {
        const map = new Map<string, string[]>();
        snap.docs.forEach(d => {
          const a = d.data();
          const tid = a.teacherId;
          if (!tid) return;
          // Try every possible field name for subject
          const sub: string = (
            a.subjectId || a.subject || a.subjectName || a.subjects || ""
          ).toString().trim();
          if (!sub) return;
          // subjectId might be comma-separated or a single name
          const parts = sub.includes(",")
            ? sub.split(",").map((s: string) => s.trim()).filter(Boolean)
            : [sub];
          const existing = map.get(tid) || [];
          const merged = Array.from(new Set([...existing, ...parts]));
          map.set(tid, merged);
        });
        setTeacherSubjectsMap(new Map(map));
      }
    );

    return () => { unsubCls(); unsubT(); unsubAssign(); };
  }, [userData?.schoolId, userData?.branchId]);

  // ── Load timetable when class changes ────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK_DATA_TS) return; // Mock mode: schedule pre-seeded above
    if (!selectedClass || !userData?.schoolId) return;

    const ttRef = doc(db, "timetable", `${userData.schoolId}_${userData.branchId}_${selectedClass}`);
    const unsub = onSnapshot(ttRef, snap => {
      if (snap.exists()) {
        setSchedule(snap.data()?.schedule || {});
      } else {
        // Initialise empty schedule for each day
        const empty: DaySchedule = {};
        DAYS.forEach(d => { empty[d] = []; });
        setSchedule(empty);
      }
    });
    return () => unsub();
  }, [selectedClass, userData?.schoolId, userData?.branchId]);

  // ── Save timetable ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedClass) return toast.error("Select a class first.");
    setSaving(true);
    try {
      const ttId  = `${userData!.schoolId}_${userData!.branchId}_${selectedClass}`;
      const cls   = classes.find(c => c.id === selectedClass);
      await setDoc(doc(db, "timetable", ttId), {
        classId:   selectedClass,
        className: cls?.name || selectedClass,
        schoolId:  userData!.schoolId,
        branchId:  userData!.branchId,
        schedule,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Timetable for ${cls?.name || selectedClass} saved!`);
    } catch (e: any) {
      toast.error("Save failed: " + e.message);
    }
    setSaving(false);
  };

  // ── Helpers for period management ──────────────────────────────────────────
  const addPeriod = (day: string) => {
    setSchedule(s => ({
      ...s,
      [day]: [...(s[day] || []), emptyPeriod()],
    }));
  };

  const addBreak = (day: string) => {
    const b: Period = { ...emptyPeriod(), isBreak: true, subject: "Break" };
    setSchedule(s => ({
      ...s,
      [day]: [...(s[day] || []), b],
    }));
  };

  const removePeriod = (day: string, periodId: string) => {
    setSchedule(s => ({
      ...s,
      [day]: (s[day] || []).filter(p => p.id !== periodId),
    }));
  };

  const updatePeriod = (day: string, periodId: string, patch: Partial<Period>) => {
    setSchedule(s => ({
      ...s,
      [day]: (s[day] || []).map(p => p.id === periodId ? { ...p, ...patch } : p),
    }));
  };

  // Get subjects for a teacher: teaching_assignments map first, teacher doc as fallback
  const getTeacherSubjects = (teacherId: string): string[] => {
    // 1. From teaching_assignments (most accurate — what they actually teach)
    const fromAssignments = teacherSubjectsMap.get(teacherId) || [];
    if (fromAssignments.length > 0) return fromAssignments;

    // 2. Fallback: teacher document fields
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return [];
    const raw =
      teacher.subjects ??
      teacher.subject ??
      teacher.subjectName ??
      teacher.primarySubject ??
      "";
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === "string" && raw.trim()) {
      return raw.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  };

  const handleTeacherChange = (day: string, periodId: string, teacherId: string) => {
    const teacher  = teachers.find(t => t.id === teacherId);
    const subjects = getTeacherSubjects(teacherId);
    updatePeriod(day, periodId, {
      teacherId,
      teacherName: teacher?.name || "",
      // Auto-select first subject; user can change from dropdown
      subject: subjects.length > 0 ? subjects[0] : "",
    });
  };

  const copyDaySchedule = (fromDay: string, toDay: string) => {
    const src = schedule[fromDay] || [];
    const copied = src.map(p => ({
      ...p,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
    }));
    setSchedule(s => ({ ...s, [toDay]: copied }));
    toast.success(`Copied ${fromDay}'s schedule to ${toDay}`);
  };

  // ── Render — route mobile → TimetableSetupMobile, desktop → TimetableSetupDesktop ──
  const sharedProps = {
    loading,
    saving,
    classes,
    selectedClass,
    setSelectedClass,
    schedule,
    teachers,
    viewMode,
    setViewMode,
    expandedDay,
    setExpandedDay,
    onSave: handleSave,
    onAddPeriod: addPeriod,
    onAddBreak: addBreak,
    onRemovePeriod: removePeriod,
    onUpdatePeriod: updatePeriod,
    onTeacherChange: handleTeacherChange,
    getTeacherSubjects,
    onCopyDay: copyDaySchedule,
  };

  return isMobile
    ? <TimetableSetupMobile {...sharedProps} />
    : <TimetableSetupDesktop {...sharedProps} />;
};

export default TimetableSetup;
