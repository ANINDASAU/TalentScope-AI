import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import time

import cv2

try:
    from src.analysis.posture import analyze_pose
    from src.analysis.graphs import generate_assessment_graphs
    from src.analysis.report import build_assessment_report
    from src.feedback.feedback import build_feedback
    from src.pose.detector import PoseDetector
    from src.tracking.counter import PushUpCounter
except ModuleNotFoundError:
    from analysis.posture import analyze_pose
    from analysis.graphs import generate_assessment_graphs
    from analysis.report import build_assessment_report
    from feedback.feedback import build_feedback
    from pose.detector import PoseDetector
    from tracking.counter import PushUpCounter


def run(source=0, output=None, report=None):
    capture = cv2.VideoCapture(source)
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open video source: {source}")

    writer = None
    counter = PushUpCounter()
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frame_index = 0
    is_live = isinstance(source, int)
    with PoseDetector() as detector:
        while True:
            ok, frame = capture.read()
            if not ok:
                break

            analysis = analyze_pose(detector.process(frame))
            timestamp = time.monotonic() if is_live else frame_index / fps
            counter.update(
                analysis.elbow_angle,
                analysis.body_line_angle,
                timestamp,
                analysis.neck_angle,
            )
            frame_index += 1
            message = build_feedback(analysis, counter)
            cv2.putText(frame, f"Valid reps: {counter.count}  No-reps: {counter.no_rep_count}", (24, 42),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (40, 220, 90), 2)
            cv2.putText(frame, f"Phase: {counter.stage}", (24, 78),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 210, 60), 2)
            elbow_text = (
                f"Elbow: {analysis.elbow_angle:.0f} deg"
                if analysis.elbow_angle is not None else "Elbow: --"
            )
            body_text = (
                f"Body line: {analysis.body_line_angle:.0f} deg"
                if analysis.body_line_angle is not None else "Body line: unverified"
            )
            cv2.putText(frame, elbow_text + "  |  " + body_text, (24, 114),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            if counter.last_rep_score is not None:
                cv2.putText(frame, f"Last rep score: {counter.last_rep_score}/100", (24, 148),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(frame, message, (24, 182),
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

    counter.finalize()
    capture.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    if report is None:
        if isinstance(source, int):
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            report = Path("outputs/results") / f"live_analysis_{stamp}.json"
        else:
            report = Path("outputs/results") / f"{Path(source).stem}_analysis.json"
    report_path = Path(report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_data = build_assessment_report(counter, source, frame_index, fps)
    graph_path = Path("outputs/graphs") / f"{report_path.stem}_graphs.png"
    generate_assessment_graphs(report_data, graph_path)
    report_data["graphs"] = {"dashboard_png": str(graph_path)}
    report_path.write_text(json.dumps(report_data, indent=2), encoding="utf-8")
    print(f"Valid repetitions: {counter.count}")
    print(f"No-reps: {counter.no_rep_count}")
    print(f"Detailed assessment report: {report_path}")
    print(f"Assessment graphs: {graph_path}")
    for rep_number, result in enumerate(counter.rep_results, start=1):
        status = "VALID" if result["valid"] else "NO-REP"
        duration = result["duration_seconds"]
        duration_text = f"{duration:.2f}s" if duration is not None else "unknown duration"
        print(f"Attempt {rep_number}: {status}, score {result['score']}/100, {duration_text}")
        if not result["cadence_ok"]:
            print("  Cadence outside the 2-3 second target.")
        for reason in result["reasons"]:
            print(f"  - {reason}")
    print(
        "Not assessed by this single side-view video: elbow flare (use a front/45-degree "
        "view), chest-to-floor clearance and knee contact (requires floor calibration), "
        "and heart rate (requires a wearable sensor)."
    )
    print("Priority improvements:")
    for item in report_data["improvement_advice"]:
        print(f"- {item['issue']}: {item['advice']}")
    return counter.count


def main():
    parser = argparse.ArgumentParser(description="Realtime and recorded-video push-up tracker")
    parser.add_argument("--video", type=Path, help="Input video path; defaults to webcam")
    parser.add_argument("--output", type=Path, help="Optional path for an annotated MP4")
    parser.add_argument("--report", type=Path, help="Optional JSON assessment report path")
    args = parser.parse_args()
    run(str(args.video) if args.video else 0, args.output, args.report)


if __name__ == "__main__":
    main()