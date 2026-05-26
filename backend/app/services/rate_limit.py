"""Rate limit em memoria (suficiente para single-worker em dev/staging).

Para producao multi-worker trocar por Redis. A API e estavel — basta trocar a
implementacao interna sem mexer nos call sites.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

_lock = threading.Lock()
_buckets: dict[str, deque[float]] = defaultdict(deque)


def hit(key: str, max_hits: int, window_seconds: int) -> tuple[bool, int]:
    """Retorna (permitido, segundos_para_reset)."""
    now = time.time()
    cutoff = now - window_seconds
    with _lock:
        bucket = _buckets[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= max_hits:
            retry_in = max(1, int(bucket[0] + window_seconds - now))
            return False, retry_in
        bucket.append(now)
        return True, 0


def cooldown_check(key: str, cooldown_seconds: int) -> tuple[bool, int]:
    """Retorna (pode_executar, segundos_restantes). Atualiza o timestamp se permitido."""
    now = time.time()
    with _lock:
        bucket = _buckets[key]
        if bucket and (now - bucket[-1]) < cooldown_seconds:
            return False, int(cooldown_seconds - (now - bucket[-1]))
        bucket.append(now)
        # mantem apenas o ultimo timestamp para cooldown
        while len(bucket) > 1:
            bucket.popleft()
        return True, 0
