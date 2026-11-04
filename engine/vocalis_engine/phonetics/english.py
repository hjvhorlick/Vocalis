"""Small independent English spelling-to-phoneme fallback.

This rule set guesses pronunciations; English spelling is irregular, so it is
not a substitute for a dictionary. It returns the prototype's phone symbols.
"""

MULTIGRAPHS = (
    ('igh', 'AY'), ('tion', 'SH AH N'), ('tch', 'CH'),
    ('ch', 'CH'), ('sh', 'SH'), ('th', 'TH'), ('ph', 'F'),
    ('ng', 'N G'), ('wh', 'W'), ('ck', 'K'), ('qu', 'K W'),
    ('ee', 'IY'), ('ea', 'IY'), ('oo', 'UW'), ('ou', 'AW'),
    ('ow', 'OW'), ('oi', 'OY'), ('oy', 'OY'), ('ai', 'EY'),
    ('ay', 'EY'), ('oa', 'OW'), ('er', 'ER'), ('ir', 'ER'),
    ('ur', 'ER'), ('ar', 'AA R'), ('or', 'AO R'),
)
LETTERS = {
    'a':'AE', 'b':'B', 'c':'K', 'd':'D', 'e':'EH', 'f':'F',
    'g':'G', 'h':'HH', 'i':'IH', 'j':'JH', 'k':'K', 'l':'L',
    'm':'M', 'n':'N', 'o':'AA', 'p':'P', 'q':'K', 'r':'R',
    's':'S', 't':'T', 'u':'AH', 'v':'V', 'w':'W', 'x':'K S',
    'y':'Y', 'z':'Z',
}
LONG_VOWELS = {'a':'EY', 'e':'IY', 'i':'AY', 'o':'OW', 'u':'UW'}


def guess_word(word: str) -> list[str]:
    """Approximate a lower-case ASCII word as phones; no external models."""
    phones: list[str] = []
    i = 0
    while i < len(word):
        # Common final silent e, except very short words.
        if i == len(word)-1 and word[i] == 'e' and len(word) > 3 and any(c in 'aeiou' for c in word[:i]):
            break
        for spelling, sound in MULTIGRAPHS:
            if word.startswith(spelling, i):
                phones.extend(sound.split())
                i += len(spelling)
                break
        else:
            char = word[i]
            if char in LONG_VOWELS and i+2 == len(word)-1 and word[i+1] not in 'aeiou' and word[-1] == 'e':
                phones.append(LONG_VOWELS[char])
            elif char == 'c' and i+1 < len(word) and word[i+1] in 'eiy':
                phones.append('S')
            elif char == 'g' and i+1 < len(word) and word[i+1] in 'eiy':
                phones.append('JH')
            elif char == 'y' and i == len(word)-1 and i > 0:
                phones.append('IY')
            elif i and char == word[i-1] and char not in 'aeiou':
                pass
            else:
                phones.extend(LETTERS[char].split())
            i += 1
    return phones
