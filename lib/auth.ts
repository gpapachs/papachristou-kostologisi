/** Τα usernames αποθηκεύονται ως ψεύτικα email, γιατί έτσι δουλεύει το Supabase Auth. */
export const USER_DOMAIN = 'kostologisi.papachristou.app';
export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@${USER_DOMAIN}`;
