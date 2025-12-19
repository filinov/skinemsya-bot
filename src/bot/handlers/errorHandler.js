import { GrammyError, HttpError } from "grammy";
import logger from "../../utils/logger.js";

export function setupBotErrorHandling(bot) {
  bot.catch((err) => {
    const ctx = err.ctx;
    const e = err.error;
    const updateId = ctx?.update?.update_id;
    
    logger.error({
      error: e.message,
      stack: e.stack,
      updateId,
      userId: ctx?.from?.id,
      chatId: ctx?.chat?.id,
      updateType: ctx?.update?.type,
    }, `Error while handling update ${updateId || "unknown"}`);
    
    // Отправляем сообщение об ошибке пользователю
    if (ctx?.chat?.id) {
      ctx.reply("⚠️ Произошла ошибка. Мы уже работаем над ее исправлением.").catch(() => {});
    }
    
    // Детализация ошибок Grammy
    if (e instanceof GrammyError) {
      logger.error({
        description: e.description,
        error_code: e.error_code,
        method: e.method,
        payload: e.payload,
        response: e.response,
      }, "Grammy error details");
      
      // Обработка специфичных ошибок
      if (e.error_code === 403) {
        logger.warn(`Bot was blocked by user ${ctx?.from?.id}`);
      } else if (e.error_code === 429) {
        const retryAfter = e.parameters?.retry_after || 1;
        logger.warn(`Rate limited. Retry after ${retryAfter} seconds`);
      }
    } else if (e instanceof HttpError) {
      logger.error({
        statusCode: e.statusCode,
        url: e.url,
        method: e.method,
      }, "HTTP error details");
    }
  });
}