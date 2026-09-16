import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/rosters")({
  head: () => ({ meta: [{ title: "جداول الدوام | HRMS" }] }),
  component: () => <M08Workspace screen="rosters" />,
});
