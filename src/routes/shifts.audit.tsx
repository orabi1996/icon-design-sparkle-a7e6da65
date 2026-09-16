import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/audit")({
  head: () => ({ meta: [{ title: "الإصدارات والتدقيق | HRMS" }] }),
  component: () => <M08Workspace screen="audit" />,
});
