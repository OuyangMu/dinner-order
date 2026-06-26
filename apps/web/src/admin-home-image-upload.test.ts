import test from "node:test";
import assert from "node:assert/strict";
import { shouldApplyUploadResult } from "./admin-home-image-upload";

test("shouldApplyUploadResult only applies upload result to the same edit session", () => {
  assert.equal(shouldApplyUploadResult(3, 3), true);
  assert.equal(shouldApplyUploadResult(2, 3), false);
});
