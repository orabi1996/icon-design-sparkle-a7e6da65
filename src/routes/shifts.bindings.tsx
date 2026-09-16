import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/bindings")({
  head: () => ({ meta: [{ title: "ربط الموظفين بالأنماط | HRMS" }] }),
  component: () => <M08Workspace screen="bindings" />,
});
