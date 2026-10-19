def build_feedback(analysis, stage):
	"""Create short, actionable feedback for the current frame."""
	if analysis.elbow_angle is None:
		return "Step into view"
	if analysis.hip_angle is not None and analysis.hip_angle < 150:
		return "Keep your hips straighter"
	if stage == "down" and analysis.elbow_angle > 105:
		return "Lower your chest"
	if stage == "up" and analysis.elbow_angle < 145:
		return "Press up fully"
	return "Good form"
