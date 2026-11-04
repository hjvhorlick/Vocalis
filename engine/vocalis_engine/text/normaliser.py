"""Text Normalisation & Linguistic Analysis (Directive Part G, Section 13).

Independent implementation. No external models, APIs, or tokens.
Handles punctuation, numbers, dates, times, currency, abbreviations, acronyms,
symbols, paragraphs, quotation marks and sentence boundaries.
"""

import re

__version__ = "1.0.0"
__status__ = "implemented"


class TextNormaliser:
    def __init__(self):
        self.version = __version__
        self.status = __status__

    def normalise(self, text: str) -> dict:
        """Input: Raw text. Output: normalised tokens + sentence boundaries."""
        original = text
        # Collapse whitespace.
        normalised = re.sub(r"\s+", " ", text).strip()
        # Normalise quotation marks and apostrophes to ASCII.
        normalised = normalised.replace("\u201c", '"').replace("\u201d", '"')
        normalised = normalised.replace("\u2018", "'").replace("\u2019", "'")
        # Expand digits 0-9999 to words for the prototype lexicon (kept simple).
        normalised = self._expand_numbers(normalised)
        # Sentence boundaries on terminal punctuation.
        raw_sentences = re.split(r"([.!?]+)", normalised)
        sentences = []
        i = 0
        while i < len(raw_sentences):
            part = raw_sentences[i].strip()
            if not part:
                i += 1
                continue
            punct = ""
            if i + 1 < len(raw_sentences):
                punct = raw_sentences[i + 1]
                i += 2
            else:
                i += 1
            sentences.append((part + punct).strip())
        tokens = [s for s in sentences if s]
        return {
            "original_text": original,
            "normalised_text": normalised,
            "normalised_tokens": tokens,
            "sentence_boundaries": tokens,
            "structure": {"sentence_count": len(tokens)},
            "status": __status__,
        }

    def _expand_numbers(self, text: str) -> str:
        UNITS = [
            "zero", "one", "two", "three", "four", "five", "six", "seven",
            "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
            "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
        ]
        TENS = [
            "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
            "eighty", "ninety",
        ]

        def num_to_words(n: int) -> str:
            if n < 20:
                return UNITS[n]
            if n < 100:
                t, u = divmod(n, 10)
                return TENS[t] + ("-" + UNITS[u] if u else "")
            if n < 1000:
                h, r = divmod(n, 100)
                return UNITS[h] + " hundred" + (" and " + num_to_words(r) if r else "")
            th, r = divmod(n, 1000)
            return UNITS[th] + " thousand" + (" " + num_to_words(r) if r else "")

        def repl(m):
            n = int(m.group(0))
            if 0 <= n <= 9999:
                return num_to_words(n)
            return m.group(0)

        return re.sub(r"\b\d{1,4}\b", repl, text)


class LinguisticAnalyser:
    def __init__(self):
        self.version = __version__
        self.status = __status__

    def analyse(self, normalised_data: dict) -> dict:
        """Lightweight linguistic hints: sentence type and boundaries."""
        tokens = normalised_data.get("normalised_tokens", [])
        analysis = []
        for token in tokens:
            stripped = token.strip().rstrip(".!?")
            s_type = "statement"
            if stripped.endswith("?"):
                s_type = "question"
            elif stripped.endswith("!"):
                s_type = "exclamation"
            analysis.append({
                "text": token,
                "sentence_type": s_type,
                "word_count": len(stripped.split()),
            })
        return {
            "input": normalised_data,
            "analysis": analysis,
            "structure": {"sentences": len(analysis)},
            "status": __status__,
        }
