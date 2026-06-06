import { Navigate } from "react-router-dom";
import { useMe } from "./useMe";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const me = useMe();
  if (me.isLoading) {
    return <div className="p-8 text-foreground">Loading…</div>;
  }
  if (!me.data) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
