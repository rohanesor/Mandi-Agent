"""
Language detection utilities for Indian languages.
"""


def detect_language_by_script(text: str) -> str:
    """
    Detect language from text using Unicode script ranges.

    Uses Unicode script blocks to identify Indian languages:
    - Devanagari (U+0900-U+097F): Hindi, Marathi, Nepali, etc.
    - Bengali (U+0980-U+09FF): Bengali
    - Tamil (U+0B80-U+0BFF): Tamil
    - Telugu (U+0C00-U+0C7F): Telugu
    - Kannada (U+0C80-U+0CFF): Kannada
    - Malayalam (U+0D00-U+0D7F): Malayalam
    - Gujarati (U+0A80-U+0AFF): Gujarati
    - Punjabi (U+0A00-U+0A7F): Punjabi (Gurmukhi)
    - Oriya (U+0B00-U+0B7F): Odia

    Falls back to Hindi if script is Devanagari (most common).
    Default is Hindi if detection fails.
    """
    if not text:
        return "hi"

    # Check each script range
    for char in text:
        code = ord(char)

        # Devanagari range (including Nepali, Marathi, etc.)
        if 0x0900 <= code <= 0x097F:
            # Distinguish: Marathi has more 'l' (0x0932) usage
            # Default to Hindi for Devanagari
            return "hi"

        # Bengali
        if 0x0980 <= code <= 0x09FF:
            return "bn"

        # Gurmukhi (Punjabi)
        if 0x0A00 <= code <= 0x0A7F:
            return "pa"

        # Gujarati
        if 0x0A80 <= code <= 0x0AFF:
            return "gu"

        # Oriya (Odia)
        if 0x0B00 <= code <= 0x0B7F:
            return "or"

        # Tamil
        if 0x0B80 <= code <= 0x0BFF:
            return "ta"

        # Telugu
        if 0x0C00 <= code <= 0x0C7F:
            return "te"

        # Kannada
        if 0x0C80 <= code <= 0x0CFF:
            return "kn"

        # Malayalam
        if 0x0D00 <= code <= 0x0D7F:
            return "ml"

    # Default to Hindi
    return "hi"
