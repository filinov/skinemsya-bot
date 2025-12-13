import { DEFAULT_MAIN_MENU_TEXT, HELP_TEXT, mainMenuKeyboard } from "../keyboards/mainMenu.js";
import { replyOrEdit } from "../utils/reply.js";

export const sendMainMenu = (ctx, text) =>
  replyOrEdit(ctx, text ?? DEFAULT_MAIN_MENU_TEXT, { reply_markup: mainMenuKeyboard });

export const sendHelp = (ctx) => replyOrEdit(ctx, HELP_TEXT, { reply_markup: mainMenuKeyboard });
