from contextlib import AbstractContextManager
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import cv2
import mediapipe as mp


_POSE_MODEL_URL = (
	"https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
	"pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
)
_TASK_LANDMARKS = {
	"nose": 0,
	"left_shoulder": 11,
	"right_shoulder": 12,
	"left_elbow": 13,
	"right_elbow": 14,
	"left_wrist": 15,
	"right_wrist": 16,
	"left_hip": 23,
	"right_hip": 24,
	"left_knee": 25,
	"right_knee": 26,
}


def _ensure_model(model_path):
	model_path = Path(model_path)
	if model_path.is_file():
		return model_path

	model_path.parent.mkdir(parents=True, exist_ok=True)
	temporary_path = model_path.with_suffix(model_path.suffix + ".download")
	try:
		with urlopen(_POSE_MODEL_URL, timeout=60) as response, temporary_path.open("wb") as model_file:
			while chunk := response.read(1024 * 1024):
				model_file.write(chunk)
		temporary_path.replace(model_path)
	except (OSError, URLError) as error:
		temporary_path.unlink(missing_ok=True)
		raise RuntimeError(
			"Could not download the MediaPipe pose model. Check your internet connection "
			f"or place pose_landmarker_lite.task at {model_path}."
		) from error
	return model_path


class PoseDetector(AbstractContextManager):
	"""MediaPipe pose wrapper compatible with Solutions and Tasks releases."""

	def __init__(self, detection_confidence=0.6, tracking_confidence=0.6, model_path=None):
		self._timestamp_ms = 0
		self._tasks_api = not hasattr(mp, "solutions")
		if self._tasks_api:
			from mediapipe.tasks import python as mp_python
			from mediapipe.tasks.python import vision

			if model_path is None:
				model_path = Path(__file__).resolve().parents[2] / "models" / "pose_landmarker_lite.task"
			model_path = _ensure_model(model_path)
			options = vision.PoseLandmarkerOptions(
				base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
				running_mode=vision.RunningMode.VIDEO,
				num_poses=1,
				min_pose_detection_confidence=detection_confidence,
				min_pose_presence_confidence=detection_confidence,
				min_tracking_confidence=tracking_confidence,
			)
			self._pose = vision.PoseLandmarker.create_from_options(options)
			self._mp = mp
		else:
			self._pose = mp.solutions.pose.Pose(
				static_image_mode=False,
				model_complexity=1,
				smooth_landmarks=True,
				min_detection_confidence=detection_confidence,
				min_tracking_confidence=tracking_confidence,
			)
			self._mp = mp

	def process(self, frame):
		rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
		if self._tasks_api:
			image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_frame)
			result = self._pose.detect_for_video(image, self._timestamp_ms)
			self._timestamp_ms += 33
			if not result.pose_landmarks:
				return {}
			landmarks = result.pose_landmarks[0]
			return {name: landmarks[index] for name, index in _TASK_LANDMARKS.items()}

		result = self._pose.process(rgb_frame)
		if not result.pose_landmarks:
			return {}
		return {
			landmark.name.lower(): result.pose_landmarks.landmark[landmark]
			for landmark in self._mp.solutions.pose.PoseLandmark
		}

	def close(self):
		self._pose.close()

	def __exit__(self, exc_type, exc_value, traceback):
		self.close()
		return False
