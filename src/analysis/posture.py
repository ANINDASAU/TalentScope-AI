from dataclasses import dataclass
from typing import Dict, Iterable, Optional, Tuple

from .angle import calculate_angle


@dataclass(frozen=True)
class PoseAnalysis:
	elbow_angle: Optional[float]
	shoulder_angle: Optional[float]
	hip_angle: Optional[float]
	side: Optional[str]


def _point(landmarks, name):
	landmark = landmarks.get(name)
	if landmark is None:
		return None
	if hasattr(landmark, "x"):
		return landmark.x, landmark.y
	return landmark


def _angles_for_side(landmarks, side):
	shoulder = _point(landmarks, f"{side}_shoulder")
	elbow = _point(landmarks, f"{side}_elbow")
	wrist = _point(landmarks, f"{side}_wrist")
	hip = _point(landmarks, f"{side}_hip")
	knee = _point(landmarks, f"{side}_knee")
	if not all((shoulder, elbow, wrist, hip, knee)):
		return None
	return (
		calculate_angle(shoulder, elbow, wrist),
		calculate_angle(elbow, shoulder, hip),
		calculate_angle(shoulder, hip, knee),
	)


def analyze_pose(landmarks: Dict[str, object], visibility_threshold=0.5):
	"""Return the most visible side's push-up angles from named landmarks."""
	visible = {
		name: landmark
		for name, landmark in landmarks.items()
		if not hasattr(landmark, "visibility")
		or landmark.visibility >= visibility_threshold
	}
	candidates = {
		side: _angles_for_side(visible, side)
		for side in ("left", "right")
	}
	available = [(side, angles) for side, angles in candidates.items() if angles]
	if not available:
		return PoseAnalysis(None, None, None, None)

	side, angles = max(
		available,
		key=lambda item: sum(
			getattr(visible.get(f"{item[0]}_{name}"), "visibility", 1.0)
			for name in ("shoulder", "elbow", "wrist", "hip", "knee")
		),
	)
	return PoseAnalysis(*angles, side)
