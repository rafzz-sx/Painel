import json
import os

path = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
if not os.path.exists(path):
    raise SystemExit("Coloque serviceAccountKey.json nesta pasta (backend) e rode de novo.")

with open(path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

print(json.dumps(data, separators=(",", ":")))
