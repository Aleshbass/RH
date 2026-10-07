from app.queue.tasks import enqueue_inbound

# Do not import ``worker`` here. Running ``python -m app.queue.worker`` first
# imports this package, and eagerly importing its executable module produces a
# runpy warning and can duplicate module-level state.
__all__ = ["enqueue_inbound"]
