/** "Abcd…wxyz" for a base58 address (safe in server and client components). */
export const shortAddress = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
