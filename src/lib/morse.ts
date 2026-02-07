const MORSE_CODE: { [key: string]: string } = {
  "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.", "G": "--.", "H": "....",
  "I": "..", "J": ".---", "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "O": "---", "P": ".--.",
  "Q": "--.-", "R": ".-.", "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-",
  "Y": "-.--", "Z": "--..", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....",
  "6": "-....", "7": "--...", "8": "---..", "9": "----.", "0": "-----", " ": "/"
};

export function textToMorse(text: string): string {
  return text
    .toUpperCase()
    .split("")
    .map(char => MORSE_CODE[char] || "")
    .join(" ");
}

/**
 * Converts Morse string to a pattern of 1s and 0s
 * 1 = Light On, 0 = Light Off
 */
export function morseToPattern(morse: string): number[] {
  const pattern: number[] = [];
  
  for (const char of morse) {
    if (char === ".") {
      pattern.push(1); // Dot
      pattern.push(0); // Gap
    } else if (char === "-") {
      pattern.push(1, 1, 1); // Dash (3x dot)
      pattern.push(0); // Gap
    } else if (char === " ") {
      pattern.push(0, 0); // Gap between letters
    } else if (char === "/") {
      pattern.push(0, 0, 0, 0); // Gap between words
    }
  }
  
  return pattern;
}
