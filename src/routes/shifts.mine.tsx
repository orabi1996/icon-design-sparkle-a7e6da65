import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/mine")({
  head: () => ({ meta: [{ title: "جدول الموظف | HRMS" }] }),
  component: () => <M08Workspace screen="mine" />,
});
