// A LIKE pattern matching `text` anywhere. LIKE treats % and _ as wildcards (and \ as the
// escape), so a search for "50%" must mean the characters themselves.
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
