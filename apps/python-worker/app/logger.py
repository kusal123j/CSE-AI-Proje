import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [python-worker] %(message)s",
)

logger = logging.getLogger("python-worker")
