import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/policies")({
  head: () => ({ meta: [{ title: "سياسات الدوام | HRMS" }] }),
  component: () => <M08Workspace screen="policies" />,
});
