import logger from "./logger.js";

/**
 * Sends a reply or tries to edit the previous callback message.
 * Falls back to sending a new message if editing fails.
 */
export const replyOrEdit = async (ctx, text, { reply_markup, parse_mode = "HTML", disable_web_page_preview } = {}) => {
  if (ctx.callbackQuery?.message?.message_id) {
    try {
      await ctx.editMessageText(text, { reply_markup, parse_mode, disable_web_page_preview });
      return;
    } catch (err) {
      const desc = err?.description?.toLowerCase?.() ?? "";
      if (desc.includes("message is not modified")) {
        // Nothing to change — treat as success to avoid spammy warnings
        return;
      }
      logger.warn({ err }, "Failed to edit message, fallback to send");
    }
  }

  return ctx.reply(text, { reply_markup, parse_mode, disable_web_page_preview });
};
