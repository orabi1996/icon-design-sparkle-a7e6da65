import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/coverage")({
  head: () => ({ meta: [{ title: "الاحتياج والتغطية | HRMS" }] }),
  component: () => <M08Workspace screen="coverage" />,
});
