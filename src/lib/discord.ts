// The community lives in Discord; this site is a second door into the same
// rooms. The invite is permanent (no expiry, no use cap) and the guild id lets
// a channel page deep-link straight into the matching Discord channel.
export const DISCORD_INVITE_URL = "https://discord.gg/cK9WeQ7jPq";
export const DISCORD_GUILD_ID = "1010083670599671838";

export function discordChannelUrl(discordChannelId: string): string {
  return `https://discord.com/channels/${DISCORD_GUILD_ID}/${discordChannelId}`;
}
