import { dispatchWorkflowEmailFn } from "./functions";
import type { WorkflowEmailEvent } from "./types";

/**
 * Universal safe workflow email notification trigger.
 * Can be called after any business event (leave submitted, stage approved, inquiry issued, etc.)
 * Runs asynchronously and never throws an unhandled rejection that would break the UI flow.
 */
export async function notifyWorkflow(event: WorkflowEmailEvent): Promise<void> {
  try {
    // Fire and forget without blocking user actions
    void dispatchWorkflowEmailFn({ data: event }).catch((err) => {
      console.warn("[WorkflowEmailDispatcher] Non-blocking dispatch notice:", err);
    });
  } catch (err) {
    console.warn("[WorkflowEmailDispatcher] Safe notice:", err);
  }
}
