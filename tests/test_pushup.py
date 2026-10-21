import pytest

from src.tracking.counter import PushUpCounter


def test_counts_only_a_complete_down_up_cycle():
	counter = PushUpCounter()

	angles = (180, 170, 85, 120, 178)
	times = (0.0, 0.2, 0.8, 1.5, 2.5)
	counts = [
		counter.update(angle, body_line_angle=178, timestamp=timestamp)
		for angle, timestamp in zip(angles, times)
	]
	assert counts == [0, 0, 0, 0, 1]
	assert counter.stage == "up"
	assert counter.last_rep_score == 100
	assert counter.no_rep_count == 0
	assert counter.rep_results[-1]["valid"] is True
	assert counter.rep_results[-1]["cadence_ok"] is True


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


def test_partial_depth_is_a_no_rep():
	counter = PushUpCounter()
	counter.update(180, body_line_angle=178, timestamp=0.0)
	counter.update(125, body_line_angle=178, timestamp=0.6)
	counter.update(178, body_line_angle=178, timestamp=1.2)

	assert counter.count == 0
	assert counter.no_rep_count == 1
	assert counter.last_rep_score == 60
	assert "Depth not reached" in counter.last_rep_reasons[0]
	assert counter.rep_results[-1]["valid"] is False
	assert counter.rep_results[-1]["cadence_ok"] is False


def test_alignment_outside_rule_range_invalidates_rep():
	counter = PushUpCounter()
	for angle, alignment, timestamp in (
		(180, 178, 0.0),
		(85, 165, 0.8),
		(120, 178, 1.5),
		(178, 178, 2.5),
	):
		counter.update(angle, body_line_angle=alignment, timestamp=timestamp)

	assert counter.count == 0
	assert counter.no_rep_count == 1
	assert counter.last_rep_score == 70
	assert any("aligned" in reason for reason in counter.last_rep_reasons)
	assert counter.rep_results[-1]["valid"] is False


def test_finalize_records_an_incomplete_attempt():
	counter = PushUpCounter()
	counter.update(170, body_line_angle=178, timestamp=0.0)
	counter.update(80, body_line_angle=178, timestamp=1.0)
	counter.finalize()

	assert counter.count == 0
	assert counter.no_rep_count == 1
	assert any("Video ended" in reason for reason in counter.rep_results[-1]["reasons"])
