from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class CounterState:
    count: int
    stage: str
    angle: Optional[float]


class PushUpCounter:
    """Count standards-compliant push-ups from pose angles and timestamps."""

    def __init__(self, down_threshold=90.0, up_threshold=175.0):
        if down_threshold >= up_threshold:
            raise ValueError("down_threshold must be less than up_threshold")

        self.down_threshold = float(down_threshold)
        self.up_threshold = float(up_threshold)
        self.alignment_min = 175.0
        self.alignment_max = 180.0
        self.reset()

    def reset(self):
        self.count = 0
        self.no_rep_count = 0
        self.stage = "up"
        self.last_angle = None
        self.last_rep_score = None
        self.last_rep_reasons = []
        self.last_rep_duration = None
        self.rep_results = []
        self.pose_frames = 0
        self.attempt_active = False
        self.saw_bottom = False
        self.alignment_observed = False
        self.alignment_ok = True
        self._started_at = None
        self._last_timestamp = None
        self._peak_angle = None
        self._ascending = False
        self._previous_angle = None
        self._min_elbow_angle = None
        self._max_elbow_angle = None
        self._min_body_line_angle = None
        self._max_body_line_angle = None
        self._neck_issue_observed = False

    def _start_attempt(self, timestamp):
        self.attempt_active = True
        self.saw_bottom = False
        self.alignment_observed = False
        self.alignment_ok = True
        self._started_at = timestamp
        self._peak_angle = None
        self._ascending = False
        self._previous_angle = None
        self._min_elbow_angle = None
        self._max_elbow_angle = None
        self._min_body_line_angle = None
        self._max_body_line_angle = None
        self._neck_issue_observed = False

    def _finish_attempt(self, timestamp, lockout, incomplete=False):
        score = (40 if self.saw_bottom else 0)
        score += 30 if self.alignment_observed and self.alignment_ok else 0
        score += 30 if lockout else 0
        reasons = []
        if not self.saw_bottom:
            reasons.append("Depth not reached: bend elbows to 90 degrees or less.")
        if not self.alignment_observed:
            reasons.append("Body alignment not verified: keep the ankles visible in side view.")
        elif not self.alignment_ok:
            reasons.append("Keep shoulders, hips, and ankles aligned at 175-180 degrees.")
        if not lockout:
            reasons.append("Finish with full arm lockout at 175 degrees or more.")
        if incomplete:
            reasons.append("Video ended before this repetition was completed.")

        self.last_rep_score = score
        self.last_rep_reasons = reasons
        self.last_rep_duration = (
            timestamp - self._started_at
            if timestamp is not None and self._started_at is not None
            else None
        )
        cadence_ok = (
            self.last_rep_duration is None
            or 2.0 <= self.last_rep_duration <= 3.0
        )
        if not reasons:
            self.count += 1
        else:
            self.no_rep_count += 1
        self.rep_results.append({
            "valid": not reasons,
            "score": score,
            "duration_seconds": self.last_rep_duration,
            "cadence_ok": cadence_ok,
            "reasons": tuple(reasons),
            "minimum_elbow_angle": self._min_elbow_angle,
            "maximum_elbow_angle": self._max_elbow_angle,
            "minimum_body_line_angle": self._min_body_line_angle,
            "maximum_body_line_angle": self._max_body_line_angle,
            "neck_issue_observed": self._neck_issue_observed,
        })
        self.attempt_active = False
        self.stage = "up"

    def finalize(self, timestamp=None):
        """Record an active partial attempt when a video or session ends."""
        if self.attempt_active:
            self._finish_attempt(
                self._last_timestamp if timestamp is None else timestamp,
                lockout=False,
                incomplete=True,
            )
        return self.count

    def update(self, elbow_angle, body_line_angle=None, timestamp=None, neck_angle=None):
        if elbow_angle is None:
            return self.count

        try:
            angle = float(elbow_angle)
        except (TypeError, ValueError):
            return self.count

        if not 0.0 <= angle <= 180.0:
            return self.count

        self.last_angle = angle
        self.pose_frames += 1
        if not self.attempt_active and angle < self.up_threshold:
            self._start_attempt(timestamp)

        if not self.attempt_active:
            self.stage = "up"
            return self.count

        if timestamp is not None:
            self._last_timestamp = timestamp
        if body_line_angle is not None:
            body_line_angle = float(body_line_angle)
            self.alignment_observed = True
            self._min_body_line_angle = (
                body_line_angle if self._min_body_line_angle is None
                else min(self._min_body_line_angle, body_line_angle)
            )
            self._max_body_line_angle = (
                body_line_angle if self._max_body_line_angle is None
                else max(self._max_body_line_angle, body_line_angle)
            )
            if not self.alignment_min <= body_line_angle <= self.alignment_max:
                self.alignment_ok = False
        if neck_angle is not None and float(neck_angle) < 160:
            self._neck_issue_observed = True
        self._min_elbow_angle = (
            angle if self._min_elbow_angle is None else min(self._min_elbow_angle, angle)
        )
        self._max_elbow_angle = (
            angle if self._max_elbow_angle is None else max(self._max_elbow_angle, angle)
        )

        if angle <= self.down_threshold:
            self.saw_bottom = True
            self.stage = "down"
        elif self.saw_bottom:
            self.stage = "down"
            if self._previous_angle is not None and angle > self._previous_angle:
                self._ascending = True
            if self._ascending:
                self._peak_angle = max(self._peak_angle or angle, angle)
        elif angle < self.up_threshold:
            self.stage = "down"

        if angle >= self.up_threshold:
            self._finish_attempt(timestamp, lockout=True)
        elif (
            self.saw_bottom
            and self._ascending
            and self._peak_angle is not None
            and self._peak_angle - angle >= 8.0
        ):
            # A clear reversal before lockout ends this as a no-rep rather than
            # merging two attempts into one repetition.
            self._finish_attempt(timestamp, lockout=False)
            self._start_attempt(timestamp)

        self._previous_angle = angle

        return self.count

    def state(self):
        return CounterState(self.count, self.stage, self.last_angle)