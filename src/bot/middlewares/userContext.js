import { upsertUserFromTelegram } from "../../services/userService.js";

export default async (ctx, next) => {
  const state = (ctx.state ??= {});
  if (ctx.from) {
    const upsertResult = await upsertUserFromTelegram(ctx.from);
    state.user = upsertResult?.user;
    state.displayName = upsertResult?.displayName;
  }
  return next();
};
