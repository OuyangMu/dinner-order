import test from "node:test";
import assert from "node:assert/strict";
import { canDecreaseDishQuantity } from "./guest-menu-stepper";

test("disables decrease button when quantity is zero", () => {
  assert.equal(canDecreaseDishQuantity(0), false);
});

test("enables decrease button when quantity is greater than zero", () => {
  assert.equal(canDecreaseDishQuantity(1), true);
  assert.equal(canDecreaseDishQuantity(2), true);
});
