from src.analysis.report import build_assessment_report
from src.tracking.counter import PushUpCounter


def test_report_includes_attempt_measurements_and_improvement_advice():
	counter = PushUpCounter()
	for angle, alignment, timestamp in (
		(180, 178, 0.0),
		(170, 178, 0.2),
		(85, 178, 0.8),
		(120, 178, 1.5),
		(178, 178, 2.5),
	):
		counter.update(angle, alignment, timestamp, neck_angle=170)

	report = build_assessment_report(counter, "workout.mp4", 100, 30)

	assert report["summary"]["valid_repetitions"] == 1
	assert report["summary"]["average_form_score"] == 100
	assert report["attempts"][0]["measurements_degrees"]["elbow_minimum"] == 85
	assert report["attempts"][0]["cadence_meets_target"] is True
	assert report["not_assessed"]["heart_rate"]
	assert report["improvement_advice"][0]["issue"] == "No scored-rule failures detected"


def test_report_recommends_corrections_for_failed_attempt():
	counter = PushUpCounter()
	counter.update(170, 165, 0.0)
	counter.update(80, 165, 0.8)
	counter.update(178, 165, 2.5)
	report = build_assessment_report(counter, "clip.mp4", 80, 30)
	issues = {item["issue"] for item in report["improvement_advice"]}

	assert report["summary"]["no_reps"] == 1
	assert "Body alignment" in issues