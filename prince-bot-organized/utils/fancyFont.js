// Renders plain text in a bold sans-serif Unicode style for headers/labels.
// Never apply this to actual command names — the text would look like a
// real command but wouldn't match the plain-ASCII command list if someone
// typed it back, so it would silently stop working.
export function fancy(str) {
  const upperBase = 0x1D5D4, lowerBase = 0x1D5EE, digitBase = 0x1D7EC;
  return str.split("").map(ch => {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(upperBase + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(lowerBase + (code - 97));
    if (code >= 48 && code <= 57) return String.fromCodePoint(digitBase + (code - 48));
    return ch;
  }).join("");
}
