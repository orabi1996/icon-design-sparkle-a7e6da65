import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/library")({
  head: () => ({ meta: [{ title: "مكتبة الشفتات | HRMS" }] }),
  component: () => <M08Workspace screen="library" />,
});
