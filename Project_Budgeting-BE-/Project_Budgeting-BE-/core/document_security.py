"""
Upload checks shared by every KYC document endpoint (client, vendor, freelancer).

A file is accepted only when its extension, the browser-reported MIME type AND the
file's own leading bytes agree that it is a PDF, JPEG or PNG - a renamed executable or
HTML file is rejected even if it is called "pan.pdf".
"""
from __future__ import annotations

import datetime
import os

from django.utils import timezone

MAX_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_DOCUMENT_TYPES = {
    ".pdf": {"application/pdf"},
    ".jpg": {"image/jpeg", "image/pjpeg"},
    ".jpeg": {"image/jpeg", "image/pjpeg"},
    ".png": {"image/png"},
}
_SIGNATURES = {
    ".pdf": (b"%PDF-",),
    ".jpg": (b"\xff\xd8\xff",),
    ".jpeg": (b"\xff\xd8\xff",),
    ".png": (b"\x89PNG\r\n\x1a\n",),
}

# Document statuses every module understands. "missing" is never stored - the UI shows it
# for a required slot with no upload. "expired" is derived from expiry_date on read.
DOCUMENT_STATUSES = ("uploaded", "under_review", "verified", "rejected", "expired")


def _leading_bytes(file, size=16) -> bytes:
    try:
        pos = file.tell()
    except (AttributeError, OSError):
        pos = 0
    try:
        file.seek(0)
        head = file.read(size) or b""
    except (AttributeError, OSError):
        head = b""
    finally:
        try:
            file.seek(pos)
        except (AttributeError, OSError):
            pass
    return head if isinstance(head, bytes) else b""


def check_document_upload(file, max_size: int = MAX_DOCUMENT_SIZE):
    """Returns (error_code, message) for a rejected upload, or None when the file is acceptable."""
    if not file:
        return "file_required", "Please choose a file to upload."
    if file.size == 0:
        return "file_empty", "The selected file is empty."
    if file.size > max_size:
        return "file_too_large", f"File is too large. Maximum size is {max_size // (1024 * 1024)} MB."
    ext = os.path.splitext(file.name or "")[1].lower()
    allowed = ALLOWED_DOCUMENT_TYPES.get(ext)
    content_type = (getattr(file, "content_type", "") or "").lower()
    # Some OSes send an empty or generic MIME type, so only an explicit mismatch is rejected.
    if not allowed or (content_type and content_type != "application/octet-stream" and content_type not in allowed):
        return "unsupported_file_type", "Only PDF, JPG, JPEG and PNG files are allowed."
    head = _leading_bytes(file)
    if not any(head.startswith(sig) for sig in _SIGNATURES[ext]):
        return "file_content_mismatch", "The file's contents don't match its type. Upload a genuine PDF, JPG or PNG file."
    if len(os.path.basename(file.name or "")) > 200:
        return "file_name_too_long", "The file name is too long. Rename the file and try again."
    return None


def parse_expiry_date(value):
    """'' / None -> None; 'YYYY-MM-DD' -> date. Raises ValueError for anything else."""
    if value in (None, "", "null"):
        return None
    if isinstance(value, datetime.date):
        return value
    return datetime.date.fromisoformat(str(value).strip())


def effective_document_status(status: str, expiry_date) -> str:
    """A non-rejected document past its expiry date reads as 'expired'."""
    if status != "rejected" and expiry_date and expiry_date < timezone.localdate():
        return "expired"
    return status


def document_counts_as_present(status: str, expiry_date) -> bool:
    """Whether a document satisfies a 'required document' rule (rejected / expired don't)."""
    return effective_document_status(status, expiry_date) not in ("rejected", "expired")
