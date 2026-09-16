import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/import")({
  head: () => ({ meta: [{ title: "الاستيراد والتسكين الجماعي | HRMS" }] }),
  component: () => <M08Workspace screen="import" />,
});
