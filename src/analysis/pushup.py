def detect_stage(elbow_angle, stage):

    if elbow_angle <= 90:
        stage = "down"

    elif elbow_angle >= 160:
        stage = "up"

    return stage