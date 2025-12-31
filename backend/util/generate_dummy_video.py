import os
import cv2

def main():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    uploads = os.path.join(base_dir, 'uploads')
    os.makedirs(uploads, exist_ok=True)
    out_path = os.path.join(uploads, 'dummy.mp4')

    fps = 24
    seconds = 8
    w, h = 640, 360
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(out_path, fourcc, fps, (w, h))

    import numpy as np
    for i in range(fps * seconds):
        # Create a blank frame with a simple moving rectangle (no vehicles)
        base = 255 if i % 2 == 0 else 230
        canvas = np.full((h, w, 3), int(base), dtype=np.uint8)
        x = int((i * 5) % (w - 60))
        cv2.rectangle(canvas, (x, 100), (x+50, 150), (0, 120, 255), -1)
        out.write(canvas)

    out.release()
    print(out_path)

if __name__ == '__main__':
    main()