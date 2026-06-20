"""Unit tests for the voice-note waveform peak reduction (`_pcm_to_peaks`).

Covers only the pure PCM→peaks math; the ffmpeg decode in `_compute_waveform`
is best-effort and falls back to None, so it isn't unit-tested here.
"""
import array

from messenger.backend.services.media import WAVEFORM_BUCKETS, _pcm_to_peaks


def _pcm(samples: list[int]) -> bytes:
    return array.array("h", samples).tobytes()


def test_peak_count_and_range():
    samples = [((i % 100) * 300 - 15000) for i in range(4000)]
    peaks = _pcm_to_peaks(_pcm(samples), buckets=WAVEFORM_BUCKETS)
    assert peaks is not None
    assert len(peaks) == WAVEFORM_BUCKETS
    assert all(0 <= p <= 100 for p in peaks)
    # Relative normalization: the loudest bucket is always 100.
    assert max(peaks) == 100


def test_silence_returns_none():
    assert _pcm_to_peaks(_pcm([0] * 2000)) is None


def test_empty_returns_none():
    assert _pcm_to_peaks(b"") is None


def test_odd_length_is_tolerated():
    # Trailing stray byte (not a full sample) must not crash.
    assert _pcm_to_peaks(_pcm([10000] * 100) + b"\x01") is not None


def test_quiet_then_loud_buckets():
    samples = [100] * 2000 + [30000] * 2000
    peaks = _pcm_to_peaks(_pcm(samples), buckets=8)
    assert peaks is not None and len(peaks) == 8
    assert max(peaks) == 100
    assert peaks[0] < peaks[-1]  # early (quiet) bars shorter than late (loud)
