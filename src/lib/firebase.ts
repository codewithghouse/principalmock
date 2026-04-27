import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Fall back to a placeholder API-key shape when the real env vars are missing
// so `initializeApp` doesn't throw `auth/invalid-api-key` and crash the whole
// app at module-load time. With mock-mode active in AuthContext + every page,
// no real Firebase calls are made — but every page still imports `db`/`auth`
// from this file, and a thrown error during init would freeze the entire UI.
const firebaseConfig = {
  apiKey:           import.meta.env.VITE_FIREBASE_API_KEY            || "AIzaSyDweUfpKmjSe1T7pqDymPrgHXFZZGdULM4",
  authDomain:       import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "mock.firebaseapp.com",
  projectId:        import.meta.env.VITE_FIREBASE_PROJECT_ID         || "mock-project",
  storageBucket:    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "mock-project.appspot.com",
  messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "0",
  appId:            import.meta.env.VITE_FIREBASE_APP_ID             || "1:0:web:0",
};

let app: any;
try {
  app = initializeApp(firebaseConfig);
} catch (err) {
  // If init still fails (e.g., previous reuse / config edge case) log it but
  // export stubs so the module load doesn't blow up downstream imports.
  console.warn("[firebase.ts] initializeApp failed — exporting stubs.", err);
  app = null;
}

// App Check — enforces that requests come from the real client, not scripted
// replays of the public API key. Enable enforcement in the Firebase Console
// (App Check → Firestore / Storage / Functions → "Enforce").
if (app && typeof window !== "undefined" && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn("[AppCheck] init failed:", err);
  }
}

// Each `getXxx` is wrapped in try/catch — if Firebase Auth can't initialise
// against the placeholder key (e.g., browser environment rejection), we still
// want the rest of the app to load. Mock-mode pages never touch these instances.
const safeGet = <T>(fn: () => T): T => {
  try { return fn(); } catch (err) {
    console.warn("[firebase.ts] service init failed:", err);
    return {} as T;
  }
};

export const auth      = app ? safeGet(() => getAuth(app))       : ({} as any);
export const db        = app ? safeGet(() => getFirestore(app))  : ({} as any);
export const storage   = app ? safeGet(() => getStorage(app))    : ({} as any);
export const functions = app ? safeGet(() => getFunctions(app))  : ({} as any);

export default app;