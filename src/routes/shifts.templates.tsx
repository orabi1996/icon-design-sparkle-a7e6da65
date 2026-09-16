import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/templates")({
  head: () => ({ meta: [{ title: "قوالب أيام العمل | HRMS" }] }),
  component: () => <M08Workspace screen="templates" />,
});
