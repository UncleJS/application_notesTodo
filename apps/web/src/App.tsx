import { BrowserRouter, Route, Routes } from "react-router-dom";
import LoginPage from "@/features/auth/LoginPage";
import RequireAuth from "@/features/auth/RequireAuth";
import Layout from "@/components/Layout";
import AdminPage from "@/pages/AdminPage";
import NotesPage from "@/pages/NotesPage";
import NoteEditorPage from "@/pages/NoteEditorPage";
import TodosPage from "@/pages/TodosPage";
import CalendarPage from "@/pages/CalendarPage";
import SettingsPage from "@/pages/SettingsPage";
import ItemDetailPage from "@/pages/ItemDetailPage";
import TemplatesPage from "@/pages/TemplatesPage";
import DashboardPage from "@/pages/DashboardPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:id" element={<NoteEditorPage />} />
          <Route path="/todos" element={<TodosPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/items/:id" element={<ItemDetailPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
