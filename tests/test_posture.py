from src.analysis.posture import analyze_pose


def test_extracts_elbow_body_line_and_neck_angles():
	landmarks = {
		"left_ear": (0.0, 0.0),
		"left_shoulder": (0.0, 1.0),
		"left_elbow": (0.0, 0.0),
		"left_wrist": (1.0, 0.0),
		"left_hip": (0.0, 2.0),
		"left_knee": (0.0, 3.0),
		"left_ankle": (0.0, 4.0),
	}

	analysis = analyze_pose(landmarks)

	assert analysis.side == "left"
	assert round(analysis.elbow_angle) == 90
	assert round(analysis.body_line_angle) == 180
	assert round(analysis.neck_angle) == 180


def test_missing_landmarks_return_unavailable_metrics():
	analysis = analyze_pose({})

	assert analysis.elbow_angle is None
	assert analysis.body_line_angle is None
	assert analysis.neck_angle is None