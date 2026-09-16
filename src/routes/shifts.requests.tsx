import { createFileRoute } from "@tanstack/react-router";
import { M08Workspace } from "@/components/hr/m08/Workspace";
export const Route = createFileRoute("/shifts/requests")({
  head: () => ({ meta: [{ title: "طلبات التغيير والتبادل | HRMS" }] }),
  component: () => <M08Workspace screen="requests" />,
});
