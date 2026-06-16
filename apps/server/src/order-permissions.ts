export type GuestOrderDeleteInput = {
  eventStatus: "DRAFT" | "OPEN" | "CLOSED";
  allowModify: boolean;
  requesterGuestToken: string;
  orderGuestToken: string;
};

export function canGuestDeleteOwnOrder(input: GuestOrderDeleteInput) {
  if (input.eventStatus !== "OPEN") {
    return { allowed: false, message: "当前活动不可撤回订单" } as const;
  }

  if (!input.allowModify) {
    return { allowed: false, message: "当前活动不允许自行修改订单" } as const;
  }

  if (!input.requesterGuestToken || input.requesterGuestToken !== input.orderGuestToken) {
    return { allowed: false, message: "只能撤回本人提交的订单" } as const;
  }

  return { allowed: true } as const;
}
