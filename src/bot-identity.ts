let botUsername: string | undefined;

export function setBotUsername(username: string | undefined): void {
  botUsername = username;
}

export function getBotUsername(): string | undefined {
  return botUsername;
}
