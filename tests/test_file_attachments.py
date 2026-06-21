from messenger.backend.services.media import MAX_FILE_BYTES, _safe_filename


def test_safe_filename_strips_path():
    assert _safe_filename("/etc/passwd") == "passwd"
    assert _safe_filename("C:\\Users\\me\\report.pdf") == "report.pdf"
    assert _safe_filename("a/b/c/photo.png") == "photo.png"


def test_safe_filename_handles_empty_and_control_chars():
    assert _safe_filename(None) == "file"
    assert _safe_filename("") == "file"
    assert _safe_filename("\x00\x01\x02") == "file"
    assert _safe_filename("na\x00me.txt") == "name.txt"


def test_safe_filename_bounds_length():
    long = "x" * 500 + ".zip"
    assert len(_safe_filename(long)) <= 200


def test_file_cap_under_nginx_limit():
    # nginx client_max_body_size is 60M; the file cap must stay under it.
    assert MAX_FILE_BYTES < 60 * 1024 * 1024
