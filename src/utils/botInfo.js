let cachedUsername;

export const getBotUsername = async (ctx) => {
  if (cachedUsername) return cachedUsername;
  const info = await ctx.api.getMe();
  cachedUsername = info.username;
  return cachedUsername;
};
