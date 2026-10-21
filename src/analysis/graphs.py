from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt


def generate_assessment_graphs(report, output_path):
	"""Save charts for scores, cadence, and rule-related angle ranges."""
	attempts = report.get("attempts", [])
	labels = [str(attempt["attempt"]) for attempt in attempts]
	colors = ["#2e8b57" if item["verdict"] == "valid" else "#d95f59" for item in attempts]

	fig, axes = plt.subplots(2, 2, figsize=(13, 8), constrained_layout=True)
	fig.suptitle(
		f"Push-Up Assessment — {Path(report.get('source', 'Session')).name}",
		fontsize=16,
		fontweight="bold",
	)
	_score_plot(axes[0, 0], attempts, labels, colors)
	_cadence_plot(axes[0, 1], attempts, labels, colors)
	_elbow_plot(axes[1, 0], attempts, labels, colors)
	_alignment_plot(axes[1, 1], attempts, labels, colors)

	output_path = Path(output_path)
	output_path.parent.mkdir(parents=True, exist_ok=True)
	fig.savefig(output_path, dpi=160, facecolor="white")
	plt.close(fig)
	return output_path


def _empty_axis(axis):
	axis.text(0.5, 0.5, "No completed attempts in this session", ha="center", va="center",
			transform=axis.transAxes)
	axis.set_axis_off()


def _score_plot(axis, attempts, labels, colors):
	axis.set_title("Form score per attempt (weighted rules)")
	axis.set_ylabel("Score / 100")
	axis.set_ylim(0, 105)
	if not attempts:
		_empty_axis(axis)
		return
	bars = axis.bar(labels, [item["form_score"] for item in attempts], color=colors)
	axis.set_xlabel("Attempt")
	for bar, item in zip(bars, attempts):
		axis.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 2,
				f"{item['form_score']} ({item['verdict'].replace('_', '-')})",
				ha="center", va="bottom", fontsize=8)


def _cadence_plot(axis, attempts, labels, colors):
	axis.set_title("Rep duration (target: 2–3 seconds)")
	axis.set_ylabel("Seconds")
	axis.axhspan(2, 3, color="#8fcf9b", alpha=0.3, label="Target range")
	axis.axhline(2, color="#4b8b5a", linestyle="--", linewidth=0.8)
	axis.axhline(3, color="#4b8b5a", linestyle="--", linewidth=0.8)
	if not attempts:
		_empty_axis(axis)
		return
	values = [item["duration_seconds"] for item in attempts]
	axis.bar(labels, [value if value is not None else 0 for value in values], color=colors)
	axis.set_xlabel("Attempt")
	axis.legend(loc="upper right", fontsize=8)
	for x, value in zip(labels, values):
		if value is not None:
			axis.text(x, value + 0.06, f"{value:.2f}s", ha="center", fontsize=8)
	axis.set_ylim(bottom=0)


def _elbow_plot(axis, attempts, labels, colors):
	axis.set_title("Elbow angle range")
	axis.set_ylabel("Degrees")
	axis.axhspan(0, 90, color="#8fcf9b", alpha=0.22, label="Bottom depth: ≤90°")
	axis.axhline(90, color="#4b8b5a", linestyle="--", linewidth=1)
	axis.axhline(175, color="#4778a8", linestyle="--", linewidth=1,
				label="Top lockout: ≥175°")
	if not attempts:
		_empty_axis(axis)
		return
	for x, item, color in zip(range(len(attempts)), attempts, colors):
		measurements = item["measurements_degrees"]
		low = measurements["elbow_minimum"]
		high = measurements["elbow_maximum"]
		if low is not None and high is not None:
			axis.vlines(x, low, high, color=color, linewidth=5, alpha=0.75)
			axis.scatter([x, x], [low, high], color=color, s=24, zorder=3)
	axis.set_xticks(range(len(labels)), labels)
	axis.set_xlabel("Attempt")
	axis.set_ylim(0, 190)
	axis.legend(loc="lower right", fontsize=8)


def _alignment_plot(axis, attempts, labels, colors):
	axis.set_title("Shoulder–hip–ankle body-line angle range")
	axis.set_ylabel("Degrees")
	axis.axhspan(175, 180, color="#8fcf9b", alpha=0.3, label="Rule target: 175–180°")
	axis.axhline(175, color="#4b8b5a", linestyle="--", linewidth=1)
	if not attempts:
		_empty_axis(axis)
		return
	for x, item, color in zip(range(len(attempts)), attempts, colors):
		measurements = item["measurements_degrees"]
		low = measurements["body_line_minimum"]
		high = measurements["body_line_maximum"]
		if low is not None and high is not None:
			axis.vlines(x, low, high, color=color, linewidth=5, alpha=0.75)
			axis.scatter([x, x], [low, high], color=color, s=24, zorder=3)
	axis.set_xticks(range(len(labels)), labels)
	axis.set_xlabel("Attempt")
	axis.set_ylim(140, 185)
	axis.legend(loc="lower right", fontsize=8)