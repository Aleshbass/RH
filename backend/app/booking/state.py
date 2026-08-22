def advance_to_confirmed(booking_id: str, *args, **kwargs) -> None:
    raise RuntimeError("booking status advances on webhooks only")
