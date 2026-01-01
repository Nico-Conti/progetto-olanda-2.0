
# Singleton status store (simple in-memory example)
class ScraperStatusStore:
    def __init__(self):
        self.is_running = False
        self.message = "Idle"
        self.progress = 0 # 0-100 (estimated) or text
        self.overall_progress = 0 # 0-100 (leagues completed)
        self.last_updated = None

_status = ScraperStatusStore()

def get_status():
    return {
        "is_running": _status.is_running,
        "message": _status.message,
        "progress": _status.progress,
        "overall_progress": _status.overall_progress
    }

def update_status(is_running=None, message=None, progress=None, overall_progress=None):
    if is_running is not None:
        _status.is_running = is_running
    if message is not None:
        _status.message = message
    if progress is not None:
        _status.progress = progress
    if overall_progress is not None:
        _status.overall_progress = overall_progress
