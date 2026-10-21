def build_feedback(analysis, counter):
	"""Return feedback prioritized from the workbook's measurable rules."""
	if analysis.elbow_angle is None:
		return "Step into the side-view camera"
	if analysis.neck_angle is not None and analysis.neck_angle < 160:
		return "Keep your neck neutral; look down"
	if (
		analysis.body_line_angle is not None
		and not 175 <= analysis.body_line_angle <= 180
	):
		return "Keep shoulders, hips, and ankles in one straight line"
	if counter.attempt_active and not counter.saw_bottom and analysis.elbow_angle > 90:
		return "Lower until your elbow angle is 90 degrees or less"
	if counter.attempt_active and counter.saw_bottom and analysis.elbow_angle < 175:
		return "Press up to full arm lockout (175 degrees or more)"
	if counter.last_rep_reasons:
		return counter.last_rep_reasons[0]
	if counter.last_rep_duration is not None and not 2.0 <= counter.last_rep_duration <= 3.0:
		return "Target a controlled 2-3 second repetition"
	return "Good form - elbow flare needs a front-view check"
