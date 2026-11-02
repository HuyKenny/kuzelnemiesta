"""Minimal PHP unserialize() (strings are byte-length prefixed → work on bytes)."""


def loads(s):
    b = s.encode("utf-8") if isinstance(s, str) else s
    v, _ = _parse(b, 0)
    return v


def _parse(b, i):
    t = b[i:i + 1]
    if t == b"N":
        return None, i + 2
    if t in (b"i", b"d", b"b"):
        j = b.index(b";", i)
        raw = b[i + 2:j].decode()
        return (int(raw) if t == b"i" else bool(int(raw)) if t == b"b" else float(raw)), j + 1
    if t == b"s":
        j = b.index(b":", i + 2)
        n = int(b[i + 2:j])
        return b[j + 2:j + 2 + n].decode("utf-8", "replace"), j + 2 + n + 2
    if t == b"a":
        j = b.index(b":", i + 2)
        n = int(b[i + 2:j])
        i = j + 2
        out = {}
        for _ in range(n):
            k, i = _parse(b, i)
            v, i = _parse(b, i)
            out[k] = v
        return out, i + 1
    if t == b"O":
        j = b.index(b":", i + 2)
        n = int(b[i + 2:j])
        i = b.index(b":", j + 2 + n + 1) + 1  # skip class name
        j = b.index(b":", i)
        cnt = int(b[i:j])
        i = j + 2
        out = {}
        for _ in range(cnt):
            k, i = _parse(b, i)
            v, i = _parse(b, i)
            out[k] = v
        return out, i + 1
    raise ValueError(f"unsupported {t!r} at {i}")
