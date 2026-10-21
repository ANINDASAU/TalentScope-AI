# TalentScope-AI

## Push-Up Tracker

Realtime and recorded-video push-up analysis using MediaPipe pose landmarks.

The tracker uses the standards in [pushup_track detail_rules.xlsx](pushup_track%20detail_rules.xlsx) to assess measurable side-view form, count valid repetitions, score reps, and identify no-reps.

### Rules currently assessed

- Bottom position: elbow angle is at or below 90 degrees (40% of the rep score).
- Body alignment: shoulder-hip-ankle angle remains between 175 and 180 degrees (30%).
- Top position: elbow angle returns to at least 175 degrees for lockout (30%).
- A repetition counts only when all three checks pass. Failed attempts are reported as no-reps with reasons.
- Each attempt reports a 0-100 score using the workbook weights. Cadence is measured separately from video timestamps; the target is 2-3 seconds per repetition and does not replace the three weighted form checks.
- A neutral neck is encouraged using the ear-shoulder-hip angle.

The displayed score is a computer-vision estimate using 2D pose landmarks, not an official sports judging result. Use a clear side view with the full body, including ankles, visible. Camera perspective, occlusion, lighting, and landmark error can affect the angles.

### Rules needing additional input

- Elbow flare (30-45 degrees) needs a front or 45-degree view; the side-view tracker does not claim to assess it.
- Chest-to-floor distance (within 5 cm) and knee contact need a calibrated floor plane and suitable view. The elbow-angle depth rule is used as the current depth proxy.
- Heart rate cannot be measured from this pose model; use a compatible wearable sensor.
- The workbook's suggested 30-60 FPS recording quality is recommended for data capture; lower frame rates can reduce angle and cadence accuracy.

## Setup

```powershell
python -m venv pushupvenv
.\pushupvenv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run

Start the webcam tracker:

```powershell
python src/main.py
```

Analyze a recorded video and save the annotated result:

```powershell
python src/main.py --video data/videos/workout.mp4 --output outputs/videos/workout_annotated.mp4
```

An annotated video is saved at the `--output` path. A detailed JSON assessment is generated automatically at `outputs/results/workout_analysis.json` for this example, together with a chart dashboard at `outputs/graphs/workout_analysis_graphs.png`. Choose another report location with `--report`; the matching graph is saved in `outputs/graphs/`:

```powershell
python src/main.py --video data/videos/workout.mp4 --output outputs/videos/workout_annotated.mp4 --report outputs/results/my_workout.json
```

The report includes valid reps and no-reps, the average weighted score, per-attempt elbow/body-line angle ranges, rep duration and cadence, failed rules, prioritized improvement advice, pose-detection coverage, and rules the current camera/sensors cannot assess. Graphs show attempt scores, cadence versus target, elbow-angle ranges, and body-line ranges. Webcam sessions are saved as timestamped JSON and PNG files under `outputs/results/` and `outputs/graphs/`, respectively.

Press `q` to stop processing. The program returns a non-zero error from the command line when its video source cannot be opened.

## Test

```powershell
python -m pytest -q
```
