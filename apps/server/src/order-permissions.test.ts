import test from "node:test";
import assert from "node:assert/strict";
import { canGuestDeleteOwnOrder } from "./order-permissions.js";

test("allows deleting own order when event is open and modification is enabled", () => {
  const result = canGuestDeleteOwnOrder({
    eventStatus: "OPEN",
    allowModify: true,
    requesterGuestToken: "guest-a",
    orderGuestToken: "guest-a"
  });

  assert.equal(result.allowed, true);
});

test("blocks deleting order from another guest", () => {
  const result = canGuestDeleteOwnOrder({
    eventStatus: "OPEN",
    allowModify: true,
    requesterGuestToken: "guest-a",
    orderGuestToken: "guest-b"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.message, "只能撤回本人提交的订单");
});

test("blocks deleting own order when activity does not allow modification", () => {
  const result = canGuestDeleteOwnOrder({
    eventStatus: "OPEN",
    allowModify: false,
    requesterGuestToken: "guest-a",
    orderGuestToken: "guest-a"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.message, "当前活动不允许自行修改订单");
});

test("blocks deleting own order when activity is closed", () => {
  const result = canGuestDeleteOwnOrder({
    eventStatus: "CLOSED",
    allowModify: true,
    requesterGuestToken: "guest-a",
    orderGuestToken: "guest-a"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.message, "当前活动不可撤回订单");
});
