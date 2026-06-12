import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import LoginPage from "@/features/auth/LoginPage";
import RequireAuth from "@/features/auth/RequireAuth";
import { CreateActionProvider } from "@/features/command/CreateActionContext";
import Layout from "@/components/Layout";
import { SkeletonList } from "@/components/Skeleton";

// Pages are code-split — each becomes its own chunk so the initial bundle
// stays small (rrule + calendar code only load when needed).
const NotesPage = lazy(() => import("@/pages/NotesPage"));
const NoteEditorPage = lazy(() => import("@/pages/NoteEditorPage"));
const TodosPage = lazy(() => import("@/pages/TodosPage"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ItemDetailPage = lazy(() => import("@/pages/ItemDetailPage"));
const TemplatesPage = lazy(() => import("@/pages/TemplatesPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const AuditLogPage = lazy(() => import("@/pages/AuditLogPage"));

const page = (el: React.ReactNode) => <Suspense fallback={<SkeletonList rows={4} />}>{el}</Suspense>;

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <CreateActionProvider>
                <Layout />
              </CreateActionProvider>
            </RequireAuth>
          }
        >
          <Route index element={page(<DashboardPage />)} />
          <Route path="/notes" element={page(<NotesPage />)} />
          <Route path="/notes/:id" element={page(<NoteEditorPage />)} />
          <Route path="/todos" element={page(<TodosPage />)} />
          <Route path="/calendar" element={page(<CalendarPage />)} />
          <Route path="/items/:id" element={page(<ItemDetailPage />)} />
          <Route path="/templates" element={page(<TemplatesPage />)} />
          <Route path="/activity" element={page(<AuditLogPage />)} />
          <Route path="/settings" element={page(<SettingsPage />)} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
