from collections import Counter
from datetime import datetime, timezone


UNASSESSED_RULES = {
	"elbow_flare": "Needs a front or 45-degree camera view.",
	"chest_clearance": "Needs floor calibration to measure the 5 cm distance.",
	"knee_contact": "Needs a suitable view and calibrated floor/contact detection.",
	"heart_rate": "Needs a wearable heart-rate sensor.",
}


def _recommendations(attempts):
	counts = Counter()
	for attempt in attempts:
		for reason in attempt["reasons"]:
			if reason.startswith("Depth not reached"):
				counts["depth"] += 1
			elif "aligned" in reason or "alignment not verified" in reason:
				counts["alignment"] += 1
			elif "lockout" in reason:
				counts["lockout"] += 1
			elif "Video ended" in reason:
				counts["incomplete"] += 1
		if not attempt["cadence_ok"]:
			counts["cadence"] += 1
		if attempt["neck_issue_observed"]:
			counts["neck"] += 1

	advice = []
	if counts["depth"]:
		advice.append({
			"priority": "high",
			"issue": "Insufficient depth",
			"advice": "Lower under control until the elbow angle reaches 90 degrees or less.",
			"affected_attempts": counts["depth"],
		})
	if counts["alignment"]:
		advice.append({
			"priority": "high",
			"issue": "Body alignment",
			"advice": "Brace your core and keep shoulders, hips, and ankles aligned; keep all three visible from the side.",
			"affected_attempts": counts["alignment"],
		})
	if counts["lockout"]:
		advice.append({
			"priority": "high",
			"issue": "Incomplete lockout",
			"advice": "Finish each repetition by straightening the arms to at least 175 degrees without losing body alignment.",
			"affected_attempts": counts["lockout"],
		})
	if counts["cadence"]:
		advice.append({
			"priority": "medium",
			"issue": "Cadence outside target",
			"advice": "Use a controlled 2-3 second repetition; cadence is reported separately and does not alter the weighted form score.",
			"affected_attempts": counts["cadence"],
		})
	if counts["neck"]:
		advice.append({
			"priority": "medium",
			"issue": "Neck position",
			"advice": "Keep your neck neutral and gaze toward the floor rather than reaching your chin forward.",
			"affected_attempts": counts["neck"],
		})
	if counts["incomplete"]:
		advice.append({
			"priority": "info",
			"issue": "Incomplete final attempt",
			"advice": "Record through the final lockout so the last repetition can be assessed.",
			"affected_attempts": counts["incomplete"],
		})
	if not advice:
		advice.append({
			"priority": "info",
			"issue": "No scored-rule failures detected",
			"advice": "Keep the same side-view setup and review the unassessed checks separately.",
			"affected_attempts": 0,
		})
	return advice


def build_assessment_report(counter, source, frame_count, fps):
	"""Build a JSON-compatible assessment summary from a completed session."""
	attempts = []
	for index, attempt in enumerate(counter.rep_results, start=1):
		attempts.append({
			"attempt": index,
			"verdict": "valid" if attempt["valid"] else "no_rep",
			"form_score": attempt["score"],
			"duration_seconds": attempt["duration_seconds"],
			"cadence_target_seconds": [2.0, 3.0],
			"cadence_meets_target": attempt["cadence_ok"],
			"measurements_degrees": {
				"elbow_minimum": attempt["minimum_elbow_angle"],
				"elbow_maximum": attempt["maximum_elbow_angle"],
				"body_line_minimum": attempt["minimum_body_line_angle"],
				"body_line_maximum": attempt["maximum_body_line_angle"],
			},
			"neck_issue_observed": attempt["neck_issue_observed"],
			"failed_rules": list(attempt["reasons"]),
		})

	attempt_count = len(attempts)
	mean_score = (
		round(sum(attempt["form_score"] for attempt in attempts) / attempt_count, 1)
		if attempt_count else None
	)
	valid_rate = round(counter.count / attempt_count * 100, 1) if attempt_count else None
	return {
		"report_version": 1,
		"generated_at_utc": datetime.now(timezone.utc).isoformat(),
		"source": str(source),
		"model": "MediaPipe Pose Landmarker",
		"assessment_type": "2D computer-vision estimate; not an official sports judging result",
		"video": {
			"frames_processed": frame_count,
			"fps": round(float(fps), 3),
			"frames_with_pose": counter.pose_frames,
			"pose_detection_rate_percent": round(counter.pose_frames / frame_count * 100, 1)
			if frame_count else 0.0,
		},
		"summary": {
			"valid_repetitions": counter.count,
			"no_reps": counter.no_rep_count,
			"attempts": attempt_count,
			"valid_rep_rate_percent": valid_rate,
			"average_form_score": mean_score,
			"form_score_weights_percent": {
				"depth": 40,
				"body_alignment": 30,
				"top_lockout": 30,
			},
		},
		"rules_assessed": {
			"bottom_elbow_angle_max_degrees": 90,
			"body_line_angle_degrees": [175, 180],
			"top_elbow_lockout_min_degrees": 175,
			"target_rep_cadence_seconds": [2.0, 3.0],
			"neutral_neck_cue_angle_min_degrees": 160,
		},
		"attempts": attempts,
		"improvement_advice": _recommendations(counter.rep_results),
		"not_assessed": UNASSESSED_RULES,
		"interpretation_limits": [
			"Angles are estimates from 2D landmarks and depend on camera position, visibility, and pose-model accuracy.",
			"A body-line angle at the hip is a proxy and does not establish full spinal alignment or diagnose injury risk.",
			"The 0-100 score applies the workbook's three weighted binary checks; it is not a learned expert score or medical assessment.",
		],
	}