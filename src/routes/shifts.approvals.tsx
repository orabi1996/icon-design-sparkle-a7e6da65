import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/approvals")({
  head: () => ({ meta: [{ title: "مراجعة الجداول واعتمادها | HRMS" }] }),
  component: () => <M08Workspace screen="approvals" />,
});
