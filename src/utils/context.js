import { upsertUserFromTelegram } from "../services/userService.js";

export const ensureUserInContext = async (ctx) => {
  const state = (ctx.state ??= {});
  if (state.user) {
    return { user: state.user, displayName: state.displayName };
  }

  const upsertResult = await upsertUserFromTelegram(ctx.from);
  state.user = upsertResult?.user;
  state.displayName = upsertResult?.displayName;

  return upsertResult;
};
