import argparse
from pathlib import Path

import cv2

try:
    from src.analysis.posture import analyze_pose
    from src.feedback.feedback import build_feedback
    from src.pose.detector import PoseDetector
    from src.tracking.counter import PushUpCounter
except ModuleNotFoundError:
    from analysis.posture import analyze_pose
    from feedback.feedback import build_feedback
    from pose.detector import PoseDetector
    from tracking.counter import PushUpCounter


def run(source=0, output=None):
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open video source: {source}")

    writer = None
    counter = PushUpCounter()
    with PoseDetector() as detector:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            analysis = analyze_pose(detector.process(frame))
            counter.update(analysis.elbow_angle)
            message = build_feedback(analysis, counter.stage)
            cv2.putText(frame, f"Push-ups: {counter.count}", (24, 42),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (40, 220, 90), 2)
            cv2.putText(frame, f"Stage: {counter.stage}", (24, 78),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 210, 60), 2)
            cv2.putText(frame, message, (24, 114),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            if output and writer is None:
                Path(output).parent.mkdir(parents=True, exist_ok=True)
                fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
                size = (frame.shape[1], frame.shape[0])
                writer = cv2.VideoWriter(str(output), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
            if writer:
                writer.write(frame)
            cv2.imshow("AI Push-Up Tracker", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    capture.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    return counter.count


def main():
    parser = argparse.ArgumentParser(description="Realtime and recorded-video push-up tracker")
    parser.add_argument("--video", type=Path, help="Input video path; defaults to webcam")
    parser.add_argument("--output", type=Path, help="Optional path for an annotated MP4")
    args = parser.parse_args()
    run(str(args.video) if args.video else 0, args.output)


if __name__ == "__main__":
    main()