# TalentScope-AI

## Push-Up Tracker

Realtime and recorded-video push-up analysis using MediaPipe pose landmarks.

The tracker counts complete repetitions, reports the elbow, shoulder, and hip angles used for form checks, and displays short feedback on the annotated video.

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

Press `q` to stop processing. The program returns a non-zero error from the command line when its video source cannot be opened.

## Test

```powershell
python -m pytest -q
```
