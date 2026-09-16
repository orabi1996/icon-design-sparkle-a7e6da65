import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/patterns")({
  head: () => ({ meta: [{ title: "أنماط التكرار | HRMS" }] }),
  component: () => <M08Workspace screen="patterns" />,
});
