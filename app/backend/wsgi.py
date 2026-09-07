import os
import sys

# Add backend to path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from app import create_app  # noqa: E402

app = create_app()

if __name__ == "__main__":
    # Render injects PORT; default keeps local dev on 5001.
    port = int(os.environ.get("PORT", os.environ.get("FLASK_PORT", 5001)))
    app.run(host="0.0.0.0", port=port, debug=False)
