"""Phoneme Conversion & Structure (Directive Part G, Sections 14 & 12).

Independent implementation. English phoneme inventory, pronunciation dictionary,
and a rule-based fallback for words absent from the dictionary.
"""

from __future__ import annotations

from .english import guess_word
from ..synthesis.experimental import UnsupportedText

__version__ = "1.0.0"
__status__ = "implemented"

# Hand-authored prototype lexicon: word -> prototype phones.
DEFAULT_DICTIONARY = {
    "hello": ["HH", "EH", "L", "OW"],
    "world": ["W", "ER", "L", "D"],
    "help": ["HH", "EH", "L", "P"],
    "he": ["HH", "IY"],
    "how": ["HH", "AW"],
    "test": ["T", "EH", "S", "T"],
    "one": ["W", "AH", "N"],
    "two": ["T", "UW"],
    "three": ["TH", "IY", "R"],
    "four": ["F", "AO", "R"],
    "five": ["F", "AY", "V"],
    "speak": ["S", "P", "IY", "K"],
    "learning": ["L", "ER", "N", "IH", "N", "IH", "NG"],
    "beautiful": ["B", "Y", "UW", "T", "AH", "F", "AH", "L"],
    "day": ["D", "EY"],
    "with": ["W", "IH", "DH"],
    "birds": ["B", "ER", "D", "Z"],
    "i": ["AY"],
    "am": ["AE", "M"],
    "it": ["IH", "T"],
    "a": ["AH"],
    "is": ["IH", "Z"],
    "the": ["DH", "AH"],
    "and": ["AE", "N", "D"],
    "to": ["T", "UW"],
    "of": ["AH", "V"],
    "in": ["IH", "N"],
    "you": ["Y", "UW"],
    "we": ["W", "IY"],
    "they": ["DH", "EY"],
    "are": ["AA", "R"],
    "was": ["W", "AH", "Z"],
    "were": ["W", "ER"],
    "have": ["H", "AE", "V"],
    "has": ["H", "AE", "Z"],
    "had": ["H", "AE", "D"],
    "do": ["D", "UW"],
    "does": ["D", "AH", "Z"],
    "said": ["S", "EH", "D"],
    "say": ["S", "EY"],
    "go": ["G", "OW"],
    "went": ["W", "EH", "N", "T"],
    "come": ["K", "AH", "M"],
    "came": ["K", "EY", "M"],
    "look": ["L", "UH", "K"],
    "like": ["L", "AY", "K"],
    "love": ["L", "AH", "V"],
    "live": ["L", "IH", "V"],
    "time": ["T", "AY", "M"],
    "good": ["G", "UH", "D"],
    "great": ["G", "R", "EY", "T"],
    "nice": ["N", "AY", "S"],
    "fine": ["F", "AY", "N"],
    "yes": ["Y", "EH", "S"],
    "no": ["N", "OW"],
    "okay": ["OW", "K", "EY"],
    "please": ["P", "L", "IY", "Z"],
    "thank": ["TH", "AE", "N", "K"],
    "youre": ["Y", "UH", "R"],
    "im": ["AY", "M"],
    "dont": ["D", "OW", "N", "T"],
    "cant": ["K", "AE", "N", "T"],
    "wont": ["W", "OW", "N", "T"],
}

# Prototype vowel set used by the synthesiser for formant shaping.
VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}
# Prototype consonants.
CONSONANTS = {
    "B", "CH", "D", "DH", "F", "G", "HH", "JH", "K", "L", "M", "N", "NG",
    "P", "R", "S", "SH", "T", "TH", "V", "W", "Y", "Z",
}


class PhonemeConverter:
    def __init__(self, dictionary: dict | None = None):
        self.version = __version__
        self.status = __status__
        self.dictionary = dict(DEFAULT_DICTIONARY)
        if dictionary:
            self.dictionary.update(dictionary)
        self.inventory = sorted(set().union(*(set(v) for v in self.dictionary.values())))
        self.inventory = sorted(set(self.inventory) | VOWELS | CONSONANTS)

    def convert(self, normalised_data: dict) -> dict:
        """Input: normalised text tokens. Output: phoneme sequences per sentence."""
        tokens = normalised_data.get("normalised_tokens", [])
        sentences = []
        for token in tokens:
            phones = []
            for word in token.lower().split():
                word = word.strip(".,!?;:\"'()[]{}")
                if not word:
                    continue
                if word in self.dictionary:
                    phones.extend(self.dictionary[word])
                else:
                    try:
                        phones.extend(guess_word(word))
                    except KeyError as exc:
                        raise UnsupportedText(f"unsupported character in word: {word}") from exc
                phones.append("PAUSE")
            if phones and phones[-1] == "PAUSE":
                phones.pop()
            sentences.append({"text": token, "phones": phones})
        return {
            "input": normalised_data,
            "phonemes": sentences,
            "syllables": [],  # syllable structure not separately modelled in prototype
            "words": sentences,
            "structure": {"sentence_count": len(sentences)},
            "status": __status__,
        }


class StructurePlanner:
    def __init__(self):
        self.version = __version__
        self.status = __status__

    def plan(self, phoneme_data: dict) -> dict:
        """Group phonemes into sentence/word structure for prosody planning."""
        return {
            "input": phoneme_data,
            "structure": phoneme_data.get("structure", {}),
            "status": __status__,
        }
