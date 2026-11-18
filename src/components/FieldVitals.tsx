import { useEffect } from "react";
import { useConvexAuth } from "convex/react";

export default function FieldVitals() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  useEffect(() => {
    if (isLoading || import.meta.env.DEV) return;
    void import("../lib/vitals").then(({ startVitals }) => startVitals(isAuthenticated));
  }, [isAuthenticated, isLoading]);
  return null;
}
