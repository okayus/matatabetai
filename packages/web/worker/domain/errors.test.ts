import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorBody, errorStatus, parseWith, type AppError } from "./errors";

describe("errorStatus", () => {
  it.each<[AppError, number]>([
    [{ type: "validation_error", message: "m" }, 400],
    [{ type: "unauthorized" }, 401],
    [{ type: "session_expired" }, 401],
    [{ type: "registration_closed" }, 403],
    [{ type: "invite_invalid" }, 403],
    [{ type: "not_found" }, 404],
    [{ type: "invite_race" }, 409],
    [{ type: "already_member" }, 409],
    [{ type: "invite_consumed" }, 410],
    [{ type: "invite_expired" }, 410],
  ])("%o → %i", (error, status) => {
    expect(errorStatus(error)).toBe(status);
  });
  it("not_found body is exactly the existence-hiding shape", () => {
    expect(JSON.stringify(errorBody({ type: "not_found" }))).toBe('{"error":{"type":"not_found"}}');
  });
});

describe("parseWith", () => {
  it("maps zod issues to one validation_error with paths", () => {
    const r = parseWith(z.object({ a: z.string().min(1), b: z.number() }), { a: "", b: "x" });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.type).toBe("validation_error");
      expect(r.error).toHaveProperty("message", expect.stringContaining("a:"));
      expect(r.error).toHaveProperty("message", expect.stringContaining("b:"));
    }
  });
});
