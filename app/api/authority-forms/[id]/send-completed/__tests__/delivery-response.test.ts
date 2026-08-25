import { describe, expect, it } from "vitest";
import { completedDeliveryResponse } from "../route";

describe("completed authority form delivery state", () => {
  it("fails non-2xx when no recipient has confirmed delivery", async () => {
    const response = completedDeliveryResponse(0, 2, 2);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      success: false,
      state: "DELIVERY_FAILED_OR_UNRESOLVED",
      sent: 0,
      failed: 2,
      total: 2,
    });
  });

  it("reports an explicit non-success partial state", async () => {
    const response = completedDeliveryResponse(1, 1, 2);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      success: false,
      partial: true,
      state: "PARTIALLY_DELIVERED",
    });
  });

  it("reports success only when every recipient is confirmed", async () => {
    const response = completedDeliveryResponse(2, 0, 2);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, state: "DELIVERED" });
  });
});
