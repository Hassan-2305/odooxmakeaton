export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

function format(message: string, fields?: Record<string, unknown>) {
  return fields ? `${message} ${JSON.stringify(fields)}` : message;
}

export const consoleLogger: Logger = {
  info: (message, fields) => console.log(format(message, fields)),
  warn: (message, fields) => console.warn(format(message, fields)),
  error: (message, fields) => console.error(format(message, fields)),
};

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
