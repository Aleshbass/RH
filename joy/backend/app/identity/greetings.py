"""Greetings people send as a first or returning message, in Joy's five languages.

A message that is only a greeting has no clinical content, so Joy answers it with code-owned
text (the Rehabify welcome, or "welcome back") instead of asking the model to improvise.
"""

from __future__ import annotations

import re

_GREETING_WORDS = (
    r"hi+|hello+|helo|hallo|hey+|hiya|howdy|yo|good\s+(?:morning|afternoon|evening|day)|"
    r"morning|afternoon|evening|how\s+far|how\s+(?:are\s+you|you\s+dey|body)|wetin\s+dey|"
    # Yoruba, Igbo, Hausa
    r"bawo|bawo\s+ni|e\s*k[aá]a?ro|e\s*k[aá]a?s[aá]n|e\s*k[uú]\s+(?:ir[oó]l[eé]|al[eé])|e\s*k[aá]al[eé]|"
    r"kedu|nd[eé]wo|ụtụtụ\s+ọma|sannu|ina\s+kwana|ina\s+wuni|barka(?:\s+da\s+(?:safiya|yamma))?|salaam|salam\s+alaikum|assalamu\s+alaikum"
)
_TAIL = r"(?:\s+(?:joy|there|rehabify|ma|sir|madam|o+|oo+|everyone|team))*"

GREETING_ONLY_RE = re.compile(
    rf"^\s*(?:{_GREETING_WORDS}){_TAIL}(?:[\s,]+(?:{_GREETING_WORDS}){_TAIL})?[\s!,.?👋🙏😊🙂]*$",
    re.IGNORECASE,
)


def is_greeting_only(text: str) -> bool:
    return bool(GREETING_ONLY_RE.fullmatch(text or ""))
