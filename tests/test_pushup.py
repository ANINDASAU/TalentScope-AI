import pytest

from src.tracking.counter import PushUpCounter


def test_counts_only_a_complete_down_up_cycle():
	counter = PushUpCounter()

	assert [counter.update(angle) for angle in (170, 85, 120, 165)] == [0, 0, 0, 1]
	assert counter.stage == "up"


def test_ignores_missing_and_invalid_angles():
	counter = PushUpCounter()
	counter.update(80)

	assert counter.update(None) == 0
	assert counter.update("bad") == 0
	assert counter.update(250) == 0
	assert counter.stage == "down"


def test_thresholds_must_be_ordered():
	with pytest.raises(ValueError):
		PushUpCounter(160, 90)
