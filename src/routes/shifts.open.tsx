import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/open")({
  head: () => ({ meta: [{ title: "الشفتات الشاغرة | HRMS" }] }),
  component: () => <M08Workspace screen="open" />,
});
