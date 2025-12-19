const logger = {
  info: (obj, msg) => {
    if (msg) console.log(msg, obj);
    else console.log(obj);
  },
  warn: (obj, msg) => {
    if (msg) console.warn(msg, obj);
    else console.warn(obj);
  },
  error: (obj, msg) => {
    if (msg) console.error(msg, obj);
    else console.error(obj);
  },
  debug: (obj, msg) => {
    if (msg) console.debug(msg, obj);
    else console.debug(obj);
  },
};

export default logger;