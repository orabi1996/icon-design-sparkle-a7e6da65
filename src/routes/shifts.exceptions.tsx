import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/exceptions")({
  head: () => ({ meta: [{ title: "الاستثناءات وأثر التغيير | HRMS" }] }),
  component: () => <M08Workspace screen="exceptions" />,
});
