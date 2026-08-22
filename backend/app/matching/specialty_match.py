class NotReadyError(Exception):
    """Matching is reserved for Plan 2. Call sites stay stable."""


def match_physios(*args, **kwargs):
    raise NotReadyError("matching is not ready")
