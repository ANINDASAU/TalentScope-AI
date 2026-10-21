import cv2

from src.analysis.graphs import generate_assessment_graphs


def test_generate_graph_dashboard_from_report(tmp_path):
	report = {
		"source": "session.mp4",
		"attempts": [{
			"attempt": 1,
			"verdict": "no_rep",
			"form_score": 70,
			"duration_seconds": 2.5,
			"measurements_degrees": {
				"elbow_minimum": 85,
				"elbow_maximum": 170,
				"body_line_minimum": 168,
				"body_line_maximum": 179,
			},
		}],
	}
	output_path = tmp_path / "graphs" / "session.png"

	result = generate_assessment_graphs(report, output_path)
	image = cv2.imread(str(result))

	assert result.is_file()
	assert image is not None
	assert image.shape[0] > 400 and image.shape[1] > 600
